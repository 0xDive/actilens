package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// EnrollmentGrant is the identity + organization resolved from a successfully
// redeemed one-time enrollment token.
type EnrollmentGrant struct {
	User       User
	BusinessID string
}

// CreateEnrollmentToken records only the token hash. Creating a new token revokes
// any older unused token for the same member in the resolved organization. The
// token is bound to the user's current auth_version, so password resets and account
// disable/restore operations invalidate it automatically.
func (s *Store) CreateEnrollmentToken(ctx context.Context, actorID, targetUserID, tokenHash string, expiresAt time.Time) (string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	access, err := memberAccessTx(ctx, tx, actorID, targetUserID, PermissionManageEmployees)
	if err != nil {
		return "", err
	}

	var active bool
	var authVersion int
	if err := tx.QueryRow(ctx, `SELECT active, auth_version FROM users WHERE id = $1 FOR UPDATE`, targetUserID).Scan(&active, &authVersion); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", err
	}
	if !active {
		return "", ErrForbidden
	}

	// There should be one current deployment secret per member. Old values become
	// unusable immediately when an administrator asks for a new one.
	if _, err := tx.Exec(ctx, `
		UPDATE enrollment_tokens
		   SET revoked_at = now()
		 WHERE business_id = $1 AND user_id = $2
		   AND used_at IS NULL AND revoked_at IS NULL`, access.BusinessID, targetUserID); err != nil {
		return "", err
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO enrollment_tokens (token_hash, user_id, business_id, created_by, auth_version, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6)`, tokenHash, targetUserID, access.BusinessID, actorID, authVersion, expiresAt); err != nil {
		if isUniqueViolation(err) {
			return "", ErrConflict
		}
		return "", err
	}

	if err := insertAuditTx(ctx, tx, access.BusinessID, actorID, "member.enrollment_created", "member", targetUserID, map[string]any{
		"expires_at": expiresAt.UTC().Format(time.RFC3339),
		"role":       string(access.TargetRole),
	}); err != nil {
		return "", err
	}

	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return access.BusinessID, nil
}

// RedeemEnrollmentToken atomically consumes a one-time token and returns the
// member identity it represents. Expired/revoked/used/stale-version tokens are
// indistinguishable from unknown tokens to callers.
func (s *Store) RedeemEnrollmentToken(ctx context.Context, tokenHash string) (EnrollmentGrant, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return EnrollmentGrant{}, err
	}
	defer tx.Rollback(ctx)

	var tokenID string
	var grant EnrollmentGrant
	err = tx.QueryRow(ctx, `
		SELECT et.id, et.business_id,
		       u.id, COALESCE(u.email, ''), COALESCE(u.username, ''), u.display_name, u.account_type
		  FROM enrollment_tokens et
		  JOIN users u ON u.id = et.user_id
		  JOIN memberships m ON m.user_id = et.user_id AND m.business_id = et.business_id
		 WHERE et.token_hash = $1
		   AND et.used_at IS NULL
		   AND et.revoked_at IS NULL
		   AND et.expires_at > now()
		   AND et.auth_version = u.auth_version
		   AND u.active = true
		 FOR UPDATE OF et`, tokenHash).Scan(
		&tokenID, &grant.BusinessID,
		&grant.User.ID, &grant.User.Email, &grant.User.Username, &grant.User.DisplayName, &grant.User.AccountType,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return EnrollmentGrant{}, ErrNotFound
	}
	if err != nil {
		return EnrollmentGrant{}, err
	}

	ct, err := tx.Exec(ctx, `
		UPDATE enrollment_tokens
		   SET used_at = now()
		 WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL`, tokenID)
	if err != nil {
		return EnrollmentGrant{}, err
	}
	if ct.RowsAffected() != 1 {
		return EnrollmentGrant{}, ErrConflict
	}

	if err := insertAuditTx(ctx, tx, grant.BusinessID, grant.User.ID, "member.enrollment_redeemed", "member", grant.User.ID, nil); err != nil {
		return EnrollmentGrant{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return EnrollmentGrant{}, err
	}
	return grant, nil
}
