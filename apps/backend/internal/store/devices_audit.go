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
	Label      string `json:"label"`
	Hostname   string `json:"hostname"`
	Platform   string `json:"platform"`
	Arch       string `json:"arch"`
	AppVersion string `json:"app_version"`
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
		&d.ID, &d.UserID, &d.Label, &d.Hostname, &d.Platform, &d.Arch,
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

// touchDeviceTx creates or refreshes a device without ever allowing a device UUID
// to move between user accounts. A revoked UUID stays revoked until an owner restores it.
func touchDeviceTx(ctx context.Context, tx pgx.Tx, userID, deviceID string, meta DeviceMetadata) error {
	ct, err := tx.Exec(ctx, `
		INSERT INTO devices
			(id, user_id, label, hostname, platform, arch, app_version, last_seen_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, now())
		ON CONFLICT (id) DO UPDATE SET
			label = COALESCE(EXCLUDED.label, devices.label),
			hostname = COALESCE(EXCLUDED.hostname, devices.hostname),
			platform = COALESCE(EXCLUDED.platform, devices.platform),
			arch = COALESCE(EXCLUDED.arch, devices.arch),
			app_version = COALESCE(EXCLUDED.app_version, devices.app_version),
			last_seen_at = now()
		WHERE devices.user_id = EXCLUDED.user_id
		  AND devices.revoked_at IS NULL`,
		deviceID, userID, optionalText(meta.Label), optionalText(meta.Hostname),
		optionalText(meta.Platform), optionalText(meta.Arch), optionalText(meta.AppVersion),
	)
	if err != nil {
		return err
	}
	if ct.RowsAffected() > 0 {
		return nil
	}

	var existingUser string
	var revoked bool
	err = tx.QueryRow(ctx,
		`SELECT user_id, revoked_at IS NOT NULL FROM devices WHERE id = $1`, deviceID,
	).Scan(&existingUser, &revoked)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if existingUser != userID {
		return ErrForbidden
	}
	if revoked {
		return ErrDeviceRevoked
	}
	return ErrConflict
}

// TouchDevice refreshes last_seen for screenshot-only syncs and enforces revocation.
func (s *Store) TouchDevice(ctx context.Context, userID, deviceID string, meta DeviceMetadata) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := touchDeviceTx(ctx, tx, userID, deviceID, meta); err != nil {
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
func (s *Store) ListEmployeeDevices(ctx context.Context, actorID, employeeID string) ([]Device, error) {
	if _, err := s.MemberAccessWithPermission(ctx, actorID, employeeID, PermissionManageDevices); err != nil {
		return nil, err
	}

	rows, err := s.pool.Query(ctx, `SELECT `+deviceColumns+`
		FROM devices d
		WHERE d.user_id = $1
		ORDER BY d.revoked_at NULLS FIRST, d.last_seen_at DESC NULLS LAST, d.first_seen_at DESC`, employeeID)
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
func (s *Store) UpdateDevice(ctx context.Context, actorID, deviceID string, label *string, revoked *bool) (Device, error) {
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

	access, err := memberAccessTx(ctx, tx, actorID, employeeID, PermissionManageDevices)
	if err != nil {
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
	if err := insertAuditTx(ctx, tx, access.BusinessID, actorID, action, "device", deviceID, map[string]any{
		"employee_id": employeeID,
		"label":       nextLabel,
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
	encoded, err := json.Marshal(details)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO audit_events (business_id, actor_user_id, action, target_type, target_id, details)
		VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6::jsonb)`,
		businessID, actorUserID, action, targetType, targetID, string(encoded))
	return err
}

// ListAuditEvents returns recent administrative actions for a business.
func (s *Store) ListAuditEvents(ctx context.Context, actorID, businessID string, limit int) ([]AuditEvent, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	if err := s.BusinessPermissionOrForbidden(ctx, actorID, businessID, PermissionAudit); err != nil {
		return nil, err
	}

	rows, err := s.pool.Query(ctx, `
		SELECT id, business_id, actor_user_id, action, target_type,
		       COALESCE(target_id, ''), details,
		       extract(epoch FROM created_at)::bigint
		  FROM audit_events
		 WHERE business_id = $1
		 ORDER BY created_at DESC, id DESC
		 LIMIT $2`, businessID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []AuditEvent{}
	for rows.Next() {
		var ev AuditEvent
		var raw []byte
		if err := rows.Scan(&ev.ID, &ev.BusinessID, &ev.ActorUserID, &ev.Action,
			&ev.TargetType, &ev.TargetID, &raw, &ev.CreatedAt); err != nil {
			return nil, err
		}
		ev.Details = map[string]any{}
		if len(raw) > 0 {
			if err := json.Unmarshal(raw, &ev.Details); err != nil {
				return nil, err
			}
		}
		out = append(out, ev)
	}
	return out, rows.Err()
}
