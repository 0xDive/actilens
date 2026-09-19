package store

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
)

// ErrDeviceRevoked is returned when a desktop that was revoked by an owner
// attempts to sync again with the same device UUID.
var ErrDeviceRevoked = errors.New("device revoked")

// DeviceMetadata is reported by the desktop during sync. Every field is optional
// so older clients remain compatible with the newer backend.
type DeviceMetadata struct {
	Label      *string
	Hostname   *string
	Platform   *string
	Arch       *string
	AppVersion *string
}

// Device is one ActiLens installation associated with a user account.
type Device struct {
	ID         string `json:"id"`
	UserID     string `json:"user_id"`
	BusinessID string `json:"business_id"`
	Label      string `json:"label"`
	Hostname   string `json:"hostname"`
	Platform   string `json:"platform"`
	Arch       string `json:"arch"`
	AppVersion     string `json:"app_version"`
	VersionStatus  string `json:"version_status"`
	FirstSeen  int64  `json:"first_seen"`
	LastSeen   *int64 `json:"last_seen"`
	RevokedAt  *int64 `json:"revoked_at"`
}

// AuditEvent is an owner-visible administrative action. Passwords, tokens and
// screenshot contents are intentionally never written to this table.
type AuditEvent struct {
	ID          int64          `json:"id"`
	BusinessID  string         `json:"business_id"`
	ActorUserID string         `json:"actor_user_id"`
	Action      string         `json:"action"`
	TargetType  string         `json:"target_type"`
	TargetID    string         `json:"target_id"`
	Details     map[string]any `json:"details"`
	CreatedAt   int64          `json:"created_at"`
}

const deviceColumns = `
	d.id,
	d.user_id,
	COALESCE(d.business_id::text, ''),
	COALESCE(d.label, ''),
	COALESCE(d.hostname, ''),
	COALESCE(d.platform, ''),
	COALESCE(d.arch, ''),
	COALESCE(d.app_version, ''),
	extract(epoch FROM d.first_seen_at)::bigint,
	CASE WHEN d.last_seen_at IS NULL THEN NULL ELSE extract(epoch FROM d.last_seen_at)::bigint END,
	CASE WHEN d.revoked_at IS NULL THEN NULL ELSE extract(epoch FROM d.revoked_at)::bigint END`

func scanDevice(row scanner) (Device, error) {
	var d Device
	err := row.Scan(
		&d.ID, &d.UserID, &d.BusinessID, &d.Label, &d.Hostname, &d.Platform, &d.Arch,
		&d.AppVersion, &d.FirstSeen, &d.LastSeen, &d.RevokedAt,
	)
	return d, err
}

func optionalText(v *string) any {
	if v == nil {
		return nil
	}
	s := strings.TrimSpace(*v)
	if s == "" {
		return nil
	}
	return s
}

// touchDeviceTx creates or refreshes a device and binds it to exactly one
// organization. Existing unbound migration-era devices may bind on their first
// explicit sync. A UUID can never move between users or organizations.
func touchDeviceTx(
	ctx context.Context,
	tx pgx.Tx,
	userID, businessID, deviceID string,
	meta DeviceMetadata,
) error {
	updateExisting := func() (bool, error) {
		var existingUser string
		var existingBusiness *string
		var revoked bool
		err := tx.QueryRow(ctx, `
			SELECT user_id, business_id::text, revoked_at IS NOT NULL
			  FROM devices
			 WHERE id = $1
			 FOR UPDATE`,
			deviceID,
		).Scan(&existingUser, &existingBusiness, &revoked)
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		if existingUser != userID {
			return true, ErrForbidden
		}
		if revoked {
			return true, ErrDeviceRevoked
		}
		if existingBusiness != nil && *existingBusiness != businessID {
			return true, ErrForbidden
		}
		_, err = tx.Exec(ctx, `
			UPDATE devices
			   SET business_id = COALESCE(business_id, $1),
			       label = COALESCE($2, label),
			       hostname = COALESCE($3, hostname),
			       platform = COALESCE($4, platform),
			       arch = COALESCE($5, arch),
			       app_version = COALESCE($6, app_version),
			       last_seen_at = now()
			 WHERE id = $7`,
			businessID,
			optionalText(meta.Label), optionalText(meta.Hostname),
			optionalText(meta.Platform), optionalText(meta.Arch),
			optionalText(meta.AppVersion), deviceID,
		)
		return true, err
	}

	if found, err := updateExisting(); found || err != nil {
		return err
	}

	// Serialize first-seen devices for this organization so concurrent enrollments
	// cannot both pass the configured organization-wide active-device limit.
	var limit *int
	if err := tx.QueryRow(ctx, `
		SELECT device_limit
		  FROM businesses
		 WHERE id = $1
		 FOR UPDATE`,
		businessID,
	).Scan(&limit); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}

	// Another concurrent sync may have inserted this UUID while we waited.
	if found, err := updateExisting(); found || err != nil {
		return err
	}

	if limit != nil {
		var count int
		if err := tx.QueryRow(ctx, `
			SELECT count(*)
			  FROM devices
			 WHERE business_id = $1
			   AND revoked_at IS NULL`,
			businessID,
		).Scan(&count); err != nil {
			return err
		}
		if count >= *limit {
			return ErrDeviceLimitReached
		}
	}

	_, err := tx.Exec(ctx, `
		INSERT INTO devices
			(id, user_id, business_id, label, hostname, platform, arch, app_version, last_seen_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
		deviceID, userID, businessID,
		optionalText(meta.Label), optionalText(meta.Hostname),
		optionalText(meta.Platform), optionalText(meta.Arch), optionalText(meta.AppVersion),
	)
	if err != nil {
		return err
	}
	return insertAuditTx(ctx, tx, businessID, userID, "device.enrolled", "device", deviceID, map[string]any{
		"employee_id": userID,
		"label":       meta.Label,
		"hostname":    meta.Hostname,
		"platform":    meta.Platform,
		"arch":        meta.Arch,
		"app_version": meta.AppVersion,
		"changes": auditChanges(
			auditChange("device_enrolled", false, true),
		),
	})
}

// TouchDevice refreshes last_seen for screenshot-only syncs and enforces
// organization binding, revocation, and device limits.
func (s *Store) TouchDevice(
	ctx context.Context,
	userID, businessID, deviceID string,
	meta DeviceMetadata,
) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := touchDeviceTx(ctx, tx, userID, businessID, deviceID, meta); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func employeeBusinessOwnedByTx(ctx context.Context, tx pgx.Tx, ownerID, employeeID string) (string, error) {
	var businessID string
	err := tx.QueryRow(ctx, `
		SELECT b.id
		  FROM memberships m
		  JOIN businesses b ON b.id = m.business_id
		 WHERE m.user_id = $1
		   AND m.role = 'employee'
		   AND b.owner_user_id = $2
		 ORDER BY m.created_at
		 LIMIT 1`, employeeID, ownerID).Scan(&businessID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return businessID, err
}

// ListEmployeeDevices returns every installation seen for a member the actor may manage.
func (s *Store) ListEmployeeDevices(ctx context.Context, actorID, employeeID string, businessID ...string) ([]Device, error) {
	var err error
	if len(businessID) > 0 && strings.TrimSpace(businessID[0]) != "" {
		_, err = memberAccessInBusiness(ctx, s.pool, actorID, employeeID, strings.TrimSpace(businessID[0]), PermissionManageDevices)
	} else {
		_, err = s.MemberAccessWithPermission(ctx, actorID, employeeID, PermissionManageDevices)
	}
	if err != nil {
		return nil, err
	}

	query := `SELECT `+deviceColumns+`
		FROM devices d
		WHERE d.user_id = $1`
	args := []any{employeeID}
	if len(businessID) > 0 && strings.TrimSpace(businessID[0]) != "" {
		query += ` AND d.business_id = $2`
		args = append(args, strings.TrimSpace(businessID[0]))
	}
	query += ` ORDER BY d.revoked_at NULLS FIRST, d.last_seen_at DESC NULLS LAST, d.first_seen_at DESC`
	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Device{}
	for rows.Next() {
		d, err := scanDevice(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// UpdateDevice lets an owner rename, revoke or restore a device belonging to one
// of their employees. Revocation affects subsequent sync and screenshot uploads.
func (s *Store) UpdateDevice(ctx context.Context, actorID, deviceID string, label *string, revoked *bool, businessID ...string) (Device, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Device{}, err
	}
	defer tx.Rollback(ctx)

	var employeeID, currentLabel string
	var currentRevoked bool
	err = tx.QueryRow(ctx, `
		SELECT user_id, COALESCE(label, ''), revoked_at IS NOT NULL
		  FROM devices WHERE id = $1`, deviceID).
		Scan(&employeeID, &currentLabel, &currentRevoked)
	if errors.Is(err, pgx.ErrNoRows) {
		return Device{}, ErrNotFound
	}
	if err != nil {
		return Device{}, err
	}

	var access MemberAccess
	if len(businessID) > 0 && strings.TrimSpace(businessID[0]) != "" {
		access, err = memberAccessInBusiness(ctx, tx, actorID, employeeID, strings.TrimSpace(businessID[0]), PermissionManageDevices)
	} else {
		access, err = memberAccessTx(ctx, tx, actorID, employeeID, PermissionManageDevices)
	}
	if err != nil {
		return Device{}, err
	}
	if err := lockMutableOrganizationTx(ctx, tx, access.BusinessID); err != nil {
		return Device{}, err
	}

	nextLabel := currentLabel
	if label != nil {
		nextLabel = strings.TrimSpace(*label)
	}
	nextRevoked := currentRevoked
	if revoked != nil {
		nextRevoked = *revoked
	}

	if currentRevoked && !nextRevoked {
		if access.BusinessID == "" {
			return Device{}, ErrForbidden
		}
		var limit *int
		if err := tx.QueryRow(ctx, `
			SELECT device_limit
			  FROM businesses
			 WHERE id = $1
			 FOR UPDATE`, access.BusinessID,
		).Scan(&limit); err != nil {
			return Device{}, err
		}
		if limit != nil {
			var count int
			if err := tx.QueryRow(ctx, `
				SELECT count(*)
				  FROM devices
				 WHERE business_id = $1
				   AND revoked_at IS NULL
				   AND id <> $2`,
				access.BusinessID, deviceID,
			).Scan(&count); err != nil {
				return Device{}, err
			}
			if count >= *limit {
				return Device{}, ErrDeviceLimitReached
			}
		}
	}

	row := tx.QueryRow(ctx, `UPDATE devices d
		SET label = NULLIF($1, ''),
		    revoked_at = CASE WHEN $2 THEN COALESCE(d.revoked_at, now()) ELSE NULL END
		WHERE d.id = $3
		RETURNING `+deviceColumns, nextLabel, nextRevoked, deviceID)
	d, err := scanDevice(row)
	if err != nil {
		return Device{}, err
	}

	action := "device.updated"
	if revoked != nil && *revoked != currentRevoked {
		if *revoked {
			action = "device.revoked"
		} else {
			action = "device.restored"
		}
	}
	changes := []AuditChange{}
	if currentLabel != nextLabel {
		changes = append(changes, auditChange("device_label", currentLabel, nextLabel))
	}
	if currentRevoked != nextRevoked {
		changes = append(changes, auditChange("device_revoked", currentRevoked, nextRevoked))
	}
	if err := insertAuditTx(ctx, tx, access.BusinessID, actorID, action, "device", deviceID, map[string]any{
		"employee_id": employeeID,
		"label":       nextLabel,
		"changes":     changes,
	}); err != nil {
		return Device{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Device{}, err
	}
	return d, nil
}

func insertAuditTx(ctx context.Context, tx pgx.Tx, businessID, actorUserID, action, targetType, targetID string, details map[string]any) error {
	if details == nil {
		details = map[string]any{}
	}
	normalized, err := normalizeAuditDetailsTx(
		ctx, tx, businessID, actorUserID, targetType, targetID, details,
	)
	if err != nil {
		return err
	}
	encoded, err := json.Marshal(normalized)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO audit_events (business_id, actor_user_id, action, target_type, target_id, details)
		VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6::jsonb)`,
		businessID, actorUserID, action, targetType, targetID, string(encoded))
	return err
}

type AuditQuery struct {
	Limit  int
	Offset int
	UserID string
	Action string
	Search string
}

type AuditUserFacet struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type AuditPage struct {
	Events  []AuditEvent     `json:"events"`
	Total   int64            `json:"total"`
	Users   []AuditUserFacet `json:"users"`
	Actions []string         `json:"actions"`
}

func normalizeAuditQuery(query AuditQuery) AuditQuery {
	if query.Limit <= 0 || query.Limit > 100 {
		query.Limit = 50
	}
	if query.Offset < 0 {
		query.Offset = 0
	}
	query.UserID = strings.TrimSpace(query.UserID)
	query.Action = strings.TrimSpace(query.Action)
	query.Search = strings.TrimSpace(query.Search)
	return query
}

func (s *Store) auditFacets(ctx context.Context, businessID string) ([]AuditUserFacet, []string, error) {
	rows, err := s.pool.Query(ctx, `
		WITH audit_people AS (
			SELECT a.id AS event_id,
			       a.actor_user_id::text AS user_id,
			       COALESCE(
			         NULLIF(a.details->'actor'->>'display_name', ''),
			         NULLIF(u.display_name, ''),
			         a.actor_user_id::text
			       ) AS name
			  FROM audit_events a
			  LEFT JOIN users u ON u.id = a.actor_user_id
			 WHERE a.business_id = $1
			UNION ALL
			SELECT a.id AS event_id,
			       a.target_id::text AS user_id,
			       COALESCE(
			         NULLIF(a.details->'target'->>'display_name', ''),
			         NULLIF(u.display_name, ''),
			         a.target_id::text
			       ) AS name
			  FROM audit_events a
			  LEFT JOIN users u ON u.id = a.target_id
			 WHERE a.business_id = $1
			   AND a.target_id IS NOT NULL
			   AND a.target_type IN ('member', 'employee')
		),
		latest_people AS (
			SELECT DISTINCT ON (user_id) user_id, name
			  FROM audit_people
			 WHERE user_id IS NOT NULL AND user_id <> ''
			 ORDER BY user_id, event_id DESC
		)
		SELECT user_id, name
		  FROM latest_people
		 ORDER BY lower(name), user_id`,
		businessID,
	)
	if err != nil {
		return nil, nil, err
	}
	users := []AuditUserFacet{}
	for rows.Next() {
		var facet AuditUserFacet
		if err := rows.Scan(&facet.ID, &facet.Name); err != nil {
			rows.Close()
			return nil, nil, err
		}
		users = append(users, facet)
	}
	if err := rows.Close(); err != nil {
		return nil, nil, err
	}

	actionRows, err := s.pool.Query(ctx, `
		SELECT DISTINCT action
		  FROM audit_events
		 WHERE business_id = $1
		 ORDER BY action`,
		businessID,
	)
	if err != nil {
		return nil, nil, err
	}
	defer actionRows.Close()
	actions := []string{}
	for actionRows.Next() {
		var action string
		if err := actionRows.Scan(&action); err != nil {
			return nil, nil, err
		}
		actions = append(actions, action)
	}
	return users, actions, actionRows.Err()
}

// ListAuditEventsPage returns one filtered slice of the full retained audit history.
// Pagination is server-side so search and filters are not limited to the latest N rows.
func (s *Store) ListAuditEventsPage(
	ctx context.Context,
	actorID, businessID string,
	query AuditQuery,
) (AuditPage, error) {
	query = normalizeAuditQuery(query)
	if err := s.BusinessPermissionOrForbidden(ctx, actorID, businessID, PermissionAudit); err != nil {
		return AuditPage{}, err
	}

	search := query.Search
	var total int64
	err := s.pool.QueryRow(ctx, `
		SELECT count(*)
		  FROM audit_events a
		  LEFT JOIN users actor ON actor.id = a.actor_user_id
		  LEFT JOIN users target ON target.id = a.target_id
		 WHERE a.business_id = $1
		   AND (
		     $2 = ''
		     OR a.actor_user_id::text = $2
		     OR a.target_id::text = $2
		   )
		   AND ($3 = '' OR a.action = $3)
		   AND (
		     $4 = ''
		     OR a.action ILIKE '%' || $4 || '%'
		     OR a.target_type ILIKE '%' || $4 || '%'
		     OR COALESCE(a.target_id::text, '') ILIKE '%' || $4 || '%'
		     OR a.actor_user_id::text ILIKE '%' || $4 || '%'
		     OR COALESCE(actor.display_name, '') ILIKE '%' || $4 || '%'
		     OR COALESCE(target.display_name, '') ILIKE '%' || $4 || '%'
		     OR a.details::text ILIKE '%' || $4 || '%'
		   )`,
		businessID, query.UserID, query.Action, search,
	).Scan(&total)
	if err != nil {
		return AuditPage{}, err
	}

	rows, err := s.pool.Query(ctx, `
		SELECT a.id, a.business_id, a.actor_user_id, a.action, a.target_type,
		       COALESCE(a.target_id, ''), a.details,
		       extract(epoch FROM a.created_at)::bigint
		  FROM audit_events a
		  LEFT JOIN users actor ON actor.id = a.actor_user_id
		  LEFT JOIN users target ON target.id = a.target_id
		 WHERE a.business_id = $1
		   AND (
		     $2 = ''
		     OR a.actor_user_id::text = $2
		     OR a.target_id::text = $2
		   )
		   AND ($3 = '' OR a.action = $3)
		   AND (
		     $4 = ''
		     OR a.action ILIKE '%' || $4 || '%'
		     OR a.target_type ILIKE '%' || $4 || '%'
		     OR COALESCE(a.target_id::text, '') ILIKE '%' || $4 || '%'
		     OR a.actor_user_id::text ILIKE '%' || $4 || '%'
		     OR COALESCE(actor.display_name, '') ILIKE '%' || $4 || '%'
		     OR COALESCE(target.display_name, '') ILIKE '%' || $4 || '%'
		     OR a.details::text ILIKE '%' || $4 || '%'
		   )
		 ORDER BY a.created_at DESC, a.id DESC
		 LIMIT $5 OFFSET $6`,
		businessID, query.UserID, query.Action, search, query.Limit, query.Offset,
	)
	if err != nil {
		return AuditPage{}, err
	}
	defer rows.Close()

	events := []AuditEvent{}
	for rows.Next() {
		var ev AuditEvent
		var raw []byte
		if err := rows.Scan(
			&ev.ID, &ev.BusinessID, &ev.ActorUserID, &ev.Action,
			&ev.TargetType, &ev.TargetID, &raw, &ev.CreatedAt,
		); err != nil {
			return AuditPage{}, err
		}
		ev.Details = map[string]any{}
		if len(raw) > 0 {
			if err := json.Unmarshal(raw, &ev.Details); err != nil {
				return AuditPage{}, err
			}
		}
		events = append(events, ev)
	}
	if err := rows.Err(); err != nil {
		return AuditPage{}, err
	}

	users, actions, err := s.auditFacets(ctx, businessID)
	if err != nil {
		return AuditPage{}, err
	}
	return AuditPage{
		Events: events,
		Total: total,
		Users: users,
		Actions: actions,
	}, nil
}

// ListAuditEvents keeps the original store API for integrations that only need
// the newest unfiltered rows.
func (s *Store) ListAuditEvents(
	ctx context.Context,
	actorID, businessID string,
	limit int,
) ([]AuditEvent, error) {
	page, err := s.ListAuditEventsPage(ctx, actorID, businessID, AuditQuery{Limit: limit})
	if err != nil {
		return nil, err
	}
	return page.Events, nil
}


func (s *Store) ListBusinessActiveDevices(
	ctx context.Context,
	actorID, businessID string,
) ([]Device, error) {
	if err := s.BusinessPermissionOrForbidden(
		ctx, actorID, businessID, CapabilityDevicesView,
	); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `
		SELECT `+deviceColumns+`
		  FROM devices d
		  JOIN memberships m
		    ON m.user_id = d.user_id
		   AND m.business_id = d.business_id
		 WHERE d.business_id = $1
		   AND d.revoked_at IS NULL
		   AND m.status = 'active'
		 ORDER BY d.last_seen_at DESC NULLS LAST, d.first_seen_at DESC`,
		businessID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Device{}
	for rows.Next() {
		device, err := scanDevice(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, device)
	}
	return out, rows.Err()
}
