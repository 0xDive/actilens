package store

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
)

// IsUserActive reports whether the account is currently enabled.
func (s *Store) IsUserActive(ctx context.Context, userID string) (bool, error) {
	active, _, err := s.UserSecurity(ctx, userID)
	return active, err
}

// UserSecurity returns enabled state plus the session version used to revoke JWTs.
func (s *Store) UserSecurity(ctx context.Context, userID string) (bool, int, error) {
	var active bool
	var version int
	err := s.pool.QueryRow(ctx, `SELECT active, auth_version FROM users WHERE id = $1`, userID).Scan(&active, &version)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, 0, ErrNotFound
	}
	return active, version, err
}

// UpdateEmployee changes account metadata for a non-owner organization member.
// Owners and admins may manage members according to the RBAC hierarchy. Nil fields
// are left unchanged. At least one login identifier must remain.
func (s *Store) UpdateEmployee(ctx context.Context, actorID, employeeID string,
	email, username, displayName *string, active *bool) (Employee, error) {

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Employee{}, err
	}
	defer tx.Rollback(ctx)

	access, err := memberAccessTx(ctx, tx, actorID, employeeID, PermissionManageEmployees)
	if err != nil {
		return Employee{}, err
	}

	var curEmail, curUsername, curName string
	var curActive bool
	err = tx.QueryRow(ctx, `
		SELECT COALESCE(email,''), COALESCE(username,''), display_name, active
		  FROM users WHERE id = $1`, employeeID,
	).Scan(&curEmail, &curUsername, &curName, &curActive)
	if errors.Is(err, pgx.ErrNoRows) {
		return Employee{}, ErrNotFound
	}
	if err != nil {
		return Employee{}, err
	}

	nextEmail, nextUsername, nextName, nextActive := curEmail, curUsername, curName, curActive
	if email != nil {
		nextEmail = strings.TrimSpace(*email)
	}
	if username != nil {
		nextUsername = strings.ToLower(strings.TrimSpace(*username))
	}
	if displayName != nil {
		nextName = strings.TrimSpace(*displayName)
	}
	if active != nil {
		nextActive = *active
	}
	if nextEmail == "" && nextUsername == "" {
		return Employee{}, ErrConflict
	}
	if nextName == "" {
		return Employee{}, ErrConflict
	}

	var e Employee
	err = tx.QueryRow(ctx, `
		UPDATE users
		   SET email = $1, username = $2, display_name = $3,
		       auth_version = auth_version + CASE WHEN active IS DISTINCT FROM $4 THEN 1 ELSE 0 END,
		       active = $4,
		       disabled_at = CASE WHEN $4 THEN NULL ELSE COALESCE(disabled_at, now()) END
		 WHERE id = $5
		 RETURNING id, COALESCE(email,''), COALESCE(username,''), display_name, active`,
		nullableLower(nextEmail), nullableLower(nextUsername), nextName, nextActive, employeeID,
	).Scan(&e.ID, &e.Email, &e.Username, &e.DisplayName, &e.Active)
	if isUniqueViolation(err) {
		return Employee{}, ErrConflict
	}
	if err != nil {
		return Employee{}, err
	}
	e.Role = access.TargetRole

	if err := insertAuditTx(ctx, tx, access.BusinessID, actorID, "employee.updated", "member", employeeID, map[string]any{
		"display_name": e.DisplayName,
		"role":         string(e.Role),
		"active":       e.Active,
	}); err != nil {
		return Employee{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Employee{}, err
	}
	return e, nil
}

// ResetEmployeePassword changes a member password while preserving history and
// immediately invalidating their existing access/refresh tokens.
func (s *Store) ResetEmployeePassword(ctx context.Context, actorID, employeeID, passwordHash string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	access, err := memberAccessTx(ctx, tx, actorID, employeeID, PermissionManageEmployees)
	if err != nil {
		return err
	}
	ct, err := tx.Exec(ctx,
		`UPDATE users SET password_hash = $1, auth_version = auth_version + 1 WHERE id = $2`,
		passwordHash, employeeID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	if err := insertAuditTx(ctx, tx, access.BusinessID, actorID, "employee.password_reset", "member", employeeID, map[string]any{
		"role": string(access.TargetRole),
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// SetEmployeeActive archives/restores a member without deleting historical data.
func (s *Store) SetEmployeeActive(ctx context.Context, actorID, employeeID string, active bool) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	access, err := memberAccessTx(ctx, tx, actorID, employeeID, PermissionManageEmployees)
	if err != nil {
		return err
	}
	ct, err := tx.Exec(ctx, `
		UPDATE users
		   SET active = $1, auth_version = auth_version + 1,
		       disabled_at = CASE WHEN $1 THEN NULL ELSE COALESCE(disabled_at, now()) END
		 WHERE id = $2`, active, employeeID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	action := "employee.restored"
	if !active {
		action = "employee.archived"
	}
	if err := insertAuditTx(ctx, tx, access.BusinessID, actorID, action, "member", employeeID, map[string]any{
		"role": string(access.TargetRole),
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
