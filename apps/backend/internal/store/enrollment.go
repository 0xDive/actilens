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

// CreateEnrollmentToken records only the token hash. The target organization is
// explicit so a member shared by several organizations can never be provisioned
// into whichever shared membership happens to sort first.
func (s *Store) CreateEnrollmentToken(ctx context.Context, actorID, businessID, targetUserID, tokenHash string, expiresAt time.Time) (string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	actorRole, err := requireBusinessPermissionTx(ctx, tx, actorID, businessID, PermissionManageEmployees)
	if err != nil {
		return "", err
	}

	var targetRole BusinessRole
	var active bool
	var authVersion int
	err = tx.QueryRow(ctx, `
		SELECT m.role, u.active, u.auth_version
		  FROM memberships m
		  JOIN users u ON u.id = m.user_id
		 WHERE m.business_id = $1 AND m.user_id = $2
		 FOR UPDATE OF m, u`, businessID, targetUserID).Scan(&targetRole, &active, &authVersion)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	if !roleMayManageTarget(actorRole, targetRole, PermissionManageEmployees) || !active {
		return "", ErrForbidden
	}

	// There should be one current deployment secret per member in this organization.
	// Old values become unusable immediately when an administrator asks for a new one.
	if _, err := tx.Exec(ctx, `
		UPDATE enrollment_tokens
		   SET revoked_at = now()
		 WHERE business_id = $1 AND user_id = $2
		   AND used_at IS NULL AND revoked_at IS NULL`, businessID, targetUserID); err != nil {
		return "", err
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO enrollment_tokens (token_hash, user_id, business_id, created_by, auth_version, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6)`, tokenHash, targetUserID, businessID, actorID, authVersion, expiresAt); err != nil {
		if isUniqueViolation(err) {
			return "", ErrConflict
		}
		return "", err
	}

	if err := insertAuditTx(ctx, tx, businessID, actorID, "member.enrollment_created", "member", targetUserID, map[string]any{
		"expires_at": expiresAt.UTC().Format(time.RFC3339),
		"role":       string(targetRole),
	}); err != nil {
		return "", err
	}

	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return businessID, nil
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
