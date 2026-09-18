package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// MemberPurgeResult reports organization-scoped data deleted by an irreversible
// owner-only member purge. Audit events are intentionally retained.
type MemberPurgeResult struct {
	ActivityDeleted    int64 `json:"activity_deleted"`
	KeystrokesDeleted  int64 `json:"keystrokes_deleted"`
	BrowserDeleted     int64 `json:"browser_deleted"`
	ScreenshotsDeleted int64 `json:"screenshots_deleted"`
	EnrollmentsDeleted int64 `json:"enrollments_deleted"`
	AccountTombstoned  bool  `json:"account_tombstoned"`
}

// MemberPurgeScreenshotFiles authorizes an owner and returns the physical
// screenshot files that must be removed before the database purge. The final
// database transaction re-checks the same authorization to close the TOCTOU gap.
func (s *Store) MemberPurgeScreenshotFiles(ctx context.Context, actorID, businessID, targetUserID string) ([]ScreenshotFile, error) {
	actorRole, err := s.MembershipRole(ctx, actorID, businessID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrForbidden
		}
		return nil, err
	}
	if actorRole != RoleOwner {
		return nil, ErrForbidden
	}

	targetRole, err := s.MembershipRole(ctx, targetUserID, businessID)
	if err != nil {
		return nil, err
	}
	if targetRole == RoleOwner {
		return nil, ErrForbidden
	}

	rows, err := s.pool.Query(ctx, `
		SELECT id, file_path, byte_size
		  FROM screenshots
		 WHERE business_id = $1 AND user_id = $2
		 ORDER BY id`, businessID, targetUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ScreenshotFile{}
	for rows.Next() {
		var f ScreenshotFile
		if err := rows.Scan(&f.ID, &f.FilePath, &f.ByteSize); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func execDeleteCount(ctx context.Context, tx pgx.Tx, query string, args ...any) (int64, error) {
	ct, err := tx.Exec(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	return ct.RowsAffected(), nil
}

// PurgeMemberFromBusiness irreversibly removes monitoring data and membership for
// one organization. It never deletes audit history. If the user no longer belongs
// to or owns any organization, the account is reduced to an inactive tombstone so
// audit foreign keys remain valid while the original login identifiers are freed.
func (s *Store) PurgeMemberFromBusiness(ctx context.Context, actorID, businessID, targetUserID string) (MemberPurgeResult, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return MemberPurgeResult{}, err
	}
	defer tx.Rollback(ctx)

	actorRole, err := membershipRoleTx(ctx, tx, actorID, businessID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return MemberPurgeResult{}, ErrForbidden
		}
		return MemberPurgeResult{}, err
	}
	if actorRole != RoleOwner {
		return MemberPurgeResult{}, ErrForbidden
	}

	var targetRole BusinessRole
	err = tx.QueryRow(ctx,
		`SELECT role FROM memberships WHERE user_id = $1 AND business_id = $2 FOR UPDATE`,
		targetUserID, businessID,
	).Scan(&targetRole)
	if errors.Is(err, pgx.ErrNoRows) {
		return MemberPurgeResult{}, ErrNotFound
	}
	if err != nil {
		return MemberPurgeResult{}, err
	}
	if targetRole == RoleOwner {
		return MemberPurgeResult{}, ErrForbidden
	}

	var result MemberPurgeResult
	if result.EnrollmentsDeleted, err = execDeleteCount(ctx, tx,
		`DELETE FROM enrollment_tokens WHERE business_id = $1 AND user_id = $2`,
		businessID, targetUserID); err != nil {
		return MemberPurgeResult{}, err
	}
	if result.ScreenshotsDeleted, err = execDeleteCount(ctx, tx,
		`DELETE FROM screenshots WHERE business_id = $1 AND user_id = $2`,
		businessID, targetUserID); err != nil {
		return MemberPurgeResult{}, err
	}
	if result.ActivityDeleted, err = execDeleteCount(ctx, tx,
		`DELETE FROM activity_samples WHERE business_id = $1 AND user_id = $2`,
		businessID, targetUserID); err != nil {
		return MemberPurgeResult{}, err
	}
	if result.KeystrokesDeleted, err = execDeleteCount(ctx, tx,
		`DELETE FROM keystroke_buckets WHERE business_id = $1 AND user_id = $2`,
		businessID, targetUserID); err != nil {
		return MemberPurgeResult{}, err
	}
	if result.BrowserDeleted, err = execDeleteCount(ctx, tx,
		`DELETE FROM browser_visits WHERE business_id = $1 AND user_id = $2`,
		businessID, targetUserID); err != nil {
		return MemberPurgeResult{}, err
	}

	ct, err := tx.Exec(ctx,
		`DELETE FROM memberships WHERE business_id = $1 AND user_id = $2`,
		businessID, targetUserID)
	if err != nil {
		return MemberPurgeResult{}, err
	}
	if ct.RowsAffected() != 1 {
		return MemberPurgeResult{}, ErrNotFound
	}

	var hasOtherAccess bool
	err = tx.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM memberships WHERE user_id = $1)
		    OR EXISTS(SELECT 1 FROM businesses WHERE owner_user_id = $1)`,
		targetUserID,
	).Scan(&hasOtherAccess)
	if err != nil {
		return MemberPurgeResult{}, err
	}

	if hasOtherAccess {
		// Membership removal must invalidate sessions that may still point at the
		// purged organization, while preserving the account for its other orgs.
		if _, err := tx.Exec(ctx,
			`UPDATE users SET auth_version = auth_version + 1 WHERE id = $1`,
			targetUserID); err != nil {
			return MemberPurgeResult{}, err
		}
	} else {
		result.AccountTombstoned = true
		if _, err := tx.Exec(ctx, `
			UPDATE users
			   SET email = NULL,
			       username = 'deleted_' || replace(id::text, '-', ''),
			       display_name = 'Deleted user',
			       password_hash = 'deleted',
			       active = false,
			       disabled_at = COALESCE(disabled_at, now()),
			       auth_version = auth_version + 1
			 WHERE id = $1`, targetUserID); err != nil {
			return MemberPurgeResult{}, err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM devices WHERE user_id = $1`, targetUserID); err != nil {
			return MemberPurgeResult{}, err
		}
	}

	if err := insertAuditTx(ctx, tx, businessID, actorID, "member.purged", "member", targetUserID, map[string]any{
		"role":                string(targetRole),
		"activity_deleted":    result.ActivityDeleted,
		"keystrokes_deleted":  result.KeystrokesDeleted,
		"browser_deleted":     result.BrowserDeleted,
		"screenshots_deleted": result.ScreenshotsDeleted,
		"account_tombstoned":  result.AccountTombstoned,
	}); err != nil {
		return MemberPurgeResult{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return MemberPurgeResult{}, err
	}
	return result, nil
}
