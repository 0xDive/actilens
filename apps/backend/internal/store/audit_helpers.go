package store

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
)

type AuditChange struct {
	Field  string `json:"field"`
	Before any    `json:"before"`
	After  any    `json:"after"`
}

func auditChange(field string, before, after any) AuditChange {
	return AuditChange{Field: field, Before: before, After: after}
}

func auditChanges(changes ...AuditChange) []AuditChange {
	return changes
}

func auditUserSnapshotTx(
	ctx context.Context,
	tx pgx.Tx,
	businessID, userID string,
) (map[string]any, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, nil
	}
	var displayName, email, username, role string
	err := tx.QueryRow(ctx, `
		SELECT u.display_name,
		       COALESCE(u.email, ''),
		       COALESCE(u.username, ''),
		       COALESCE(m.role::text, '')
		  FROM users u
		  LEFT JOIN memberships m
		    ON m.user_id = u.id AND m.business_id = $1
		 WHERE u.id = $2`,
		businessID, userID,
	).Scan(&displayName, &email, &username, &role)
	if errors.Is(err, pgx.ErrNoRows) {
		return map[string]any{"id": userID, "type": "user"}, nil
	}
	if err != nil {
		return nil, err
	}
	out := map[string]any{
		"id": userID, "type": "user",
		"display_name": displayName,
		"email": email,
		"username": username,
	}
	if role != "" {
		out["role"] = role
	}
	return out, nil
}

func auditTargetSnapshotTx(
	ctx context.Context,
	tx pgx.Tx,
	businessID, targetType, targetID string,
) (map[string]any, error) {
	out := map[string]any{"id": targetID, "type": targetType}
	if strings.TrimSpace(targetID) == "" {
		return out, nil
	}
	switch targetType {
	case "member", "employee":
		snapshot, err := auditUserSnapshotTx(ctx, tx, businessID, targetID)
		if err != nil {
			return nil, err
		}
		if snapshot == nil {
			return out, nil
		}
		snapshot["type"] = targetType
		var status string
		var monitoring bool
		err = tx.QueryRow(ctx, `
			SELECT status, monitoring_enabled
			  FROM memberships
			 WHERE business_id = $1 AND user_id = $2`,
			businessID, targetID,
		).Scan(&status, &monitoring)
		if err == nil {
			snapshot["membership_status"] = status
			snapshot["monitoring_enabled"] = monitoring
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
		return snapshot, nil
	case "organization":
		var name, kind, timezone string
		err := tx.QueryRow(ctx, `
			SELECT name, kind, timezone FROM businesses WHERE id = $1`,
			targetID,
		).Scan(&name, &kind, &timezone)
		if errors.Is(err, pgx.ErrNoRows) {
			return out, nil
		}
		if err != nil {
			return nil, err
		}
		out["name"], out["kind"], out["timezone"] = name, kind, timezone
	case "device":
		var label, hostname, platform, arch, appVersion, userID string
		var revoked bool
		err := tx.QueryRow(ctx, `
			SELECT COALESCE(label, ''), COALESCE(hostname, ''),
			       COALESCE(platform, ''), COALESCE(arch, ''),
			       COALESCE(app_version, ''), user_id::text,
			       revoked_at IS NOT NULL
			  FROM devices WHERE id = $1`,
			targetID,
		).Scan(&label, &hostname, &platform, &arch, &appVersion, &userID, &revoked)
		if errors.Is(err, pgx.ErrNoRows) {
			return out, nil
		}
		if err != nil {
			return nil, err
		}
		out["label"], out["hostname"], out["platform"] = label, hostname, platform
		out["arch"], out["app_version"], out["user_id"], out["revoked"] = arch, appVersion, userID, revoked
	case "organization_export":
		var kind, status string
		err := tx.QueryRow(ctx, `
			SELECT kind, status
			  FROM organization_exports
			 WHERE id = $1 AND business_id = $2`,
			targetID, businessID,
		).Scan(&kind, &status)
		if errors.Is(err, pgx.ErrNoRows) {
			return out, nil
		}
		if err != nil {
			return nil, err
		}
		out["kind"] = kind
		out["status"] = status

	case "privacy_rule":
		var kind, matchType, pattern string
		var enabled bool
		err := tx.QueryRow(ctx, `
			SELECT kind, match_type, pattern, enabled
			  FROM privacy_rules
			 WHERE id = $1 AND business_id = $2`,
			targetID, businessID,
		).Scan(&kind, &matchType, &pattern, &enabled)
		if errors.Is(err, pgx.ErrNoRows) {
			return out, nil
		}
		if err != nil {
			return nil, err
		}
		out["kind"], out["match_type"], out["pattern"], out["enabled"] = kind, matchType, pattern, enabled
	}
	return out, nil
}

func normalizeAuditDetailsTx(
	ctx context.Context,
	tx pgx.Tx,
	businessID, actorUserID, targetType, targetID string,
	details map[string]any,
) (map[string]any, error) {
	out := make(map[string]any, len(details)+3)
	for key, value := range details {
		out[key] = value
	}
	out["schema_version"] = 2
	if _, ok := out["actor"]; !ok {
		actor, err := auditUserSnapshotTx(ctx, tx, businessID, actorUserID)
		if err != nil {
			return nil, err
		}
		if actor != nil {
			out["actor"] = actor
		}
	}
	if _, ok := out["target"]; !ok {
		target, err := auditTargetSnapshotTx(ctx, tx, businessID, targetType, targetID)
		if err != nil {
			return nil, err
		}
		out["target"] = target
	}
	return out, nil
}
