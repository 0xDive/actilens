package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

type BusinessRole string

const (
	RoleOwner    BusinessRole = "owner"
	RoleAdmin    BusinessRole = "admin"
	RoleManager  BusinessRole = "manager"
	RoleEmployee BusinessRole = "employee"
)

type BusinessPermission string

const (
	PermissionReports         BusinessPermission = "reports"
	PermissionManageEmployees BusinessPermission = "manage_employees"
	PermissionManageDevices   BusinessPermission = "manage_devices"
	PermissionSettings        BusinessPermission = "settings"
	PermissionAudit           BusinessPermission = "audit"
	PermissionManageRoles     BusinessPermission = "manage_roles"
)

type Membership struct {
	BusinessID        string       `json:"business_id"`
	BusinessName      string       `json:"business_name"`
	Role              BusinessRole `json:"role"`
	MonitoringEnabled bool         `json:"monitoring_enabled"`
}

type BusinessAccess struct {
	Business Business     `json:"business"`
	Role     BusinessRole `json:"role"`
}

func ValidBusinessRole(role BusinessRole) bool {
	switch role {
	case RoleOwner, RoleAdmin, RoleManager, RoleEmployee:
		return true
	default:
		return false
	}
}

func roleAllows(role BusinessRole, permission BusinessPermission) bool {
	switch permission {
	case PermissionReports:
		return role == RoleOwner || role == RoleAdmin || role == RoleManager
	case PermissionManageEmployees, PermissionManageDevices, PermissionSettings, PermissionAudit:
		return role == RoleOwner || role == RoleAdmin
	case PermissionManageRoles:
		return role == RoleOwner
	default:
		return false
	}
}

func (s *Store) MembershipRole(ctx context.Context, userID, businessID string) (BusinessRole, error) {
	var role BusinessRole
	err := s.pool.QueryRow(ctx,
		`SELECT role FROM memberships WHERE user_id = $1 AND business_id = $2`,
		userID, businessID,
	).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return role, err
}

func (s *Store) MembershipMonitoringEnabled(ctx context.Context, userID, businessID string) (bool, error) {
	var enabled bool
	err := s.pool.QueryRow(ctx,
		`SELECT monitoring_enabled FROM memberships WHERE user_id = $1 AND business_id = $2`,
		userID, businessID,
	).Scan(&enabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, ErrNotFound
	}
	return enabled, err
}

func membershipRoleTx(ctx context.Context, tx pgx.Tx, userID, businessID string) (BusinessRole, error) {
	var role BusinessRole
	err := tx.QueryRow(ctx,
		`SELECT role FROM memberships WHERE user_id = $1 AND business_id = $2`,
		userID, businessID,
	).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return role, err
}

func (s *Store) HasBusinessPermission(ctx context.Context, userID, businessID string, permission BusinessPermission) (bool, error) {
	role, err := s.MembershipRole(ctx, userID, businessID)
	if errors.Is(err, ErrNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return roleAllows(role, permission), nil
}

func requireBusinessPermissionTx(ctx context.Context, tx pgx.Tx, userID, businessID string, permission BusinessPermission) (BusinessRole, error) {
	role, err := membershipRoleTx(ctx, tx, userID, businessID)
	if errors.Is(err, ErrNotFound) {
		return "", ErrForbidden
	}
	if err != nil {
		return "", err
	}
	if !roleAllows(role, permission) {
		return role, ErrForbidden
	}
	return role, nil
}

func (s *Store) MembershipsForUser(ctx context.Context, userID string) ([]Membership, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT m.business_id, b.name, m.role, m.monitoring_enabled
		  FROM memberships m
		  JOIN businesses b ON b.id = m.business_id
		 WHERE m.user_id = $1
		 ORDER BY b.created_at, b.name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Membership{}
	for rows.Next() {
		var m Membership
		if err := rows.Scan(&m.BusinessID, &m.BusinessName, &m.Role, &m.MonitoringEnabled); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// ListBusinessesForConsole returns businesses visible in the administrative web
// console. Employees intentionally do not get a console business list.
func (s *Store) ListBusinessesForConsole(ctx context.Context, userID string) ([]BusinessAccess, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT `+businessCols+`, m.role
		  FROM memberships m
		  JOIN businesses b ON b.id = m.business_id
		 WHERE m.user_id = $1 AND m.role IN ('owner','admin','manager')
		 ORDER BY b.created_at, b.name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []BusinessAccess{}
	for rows.Next() {
		var a BusinessAccess
		if err := rows.Scan(
			&a.Business.ID, &a.Business.Name, &a.Business.Kind, &a.Business.OwnerUserID,
			&a.Business.ScreenshotRetentionDays, &a.Business.ScreenshotIntervalS,
			&a.Business.IdleThresholdS, &a.Business.AllowEmployeeOverride,
			&a.Business.ScreenshotMode, &a.Business.ScreenshotSkipApps, &a.Role,
		); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// UpdateMembershipRole is owner-only. The business owner cannot demote themselves.
func (s *Store) UpdateMembershipRole(ctx context.Context, actorID, businessID, targetUserID string, role BusinessRole) error {
	if role != RoleAdmin && role != RoleManager && role != RoleEmployee {
		return ErrConflict
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := requireBusinessPermissionTx(ctx, tx, actorID, businessID, PermissionManageRoles); err != nil {
		return err
	}

	var current BusinessRole
	err = tx.QueryRow(ctx,
		`SELECT role FROM memberships WHERE user_id = $1 AND business_id = $2 FOR UPDATE`,
		targetUserID, businessID,
	).Scan(&current)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if current == RoleOwner {
		return ErrForbidden
	}

	if _, err := tx.Exec(ctx,
		`UPDATE memberships SET role = $1 WHERE user_id = $2 AND business_id = $3`,
		role, targetUserID, businessID,
	); err != nil {
		return err
	}
	if err := insertAuditTx(ctx, tx, businessID, actorID, "member.role_changed", "member", targetUserID, map[string]any{
		"from": string(current),
		"to":   string(role),
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// UpdateMembershipMonitoring toggles collection for a member without changing
// their account role. Owners may change any non-owner member. Admins may change
// managers/employees but never the owner or a peer admin.
func (s *Store) UpdateMembershipMonitoring(ctx context.Context, actorID, businessID, targetUserID string, enabled bool) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	actorRole, err := requireBusinessPermissionTx(ctx, tx, actorID, businessID, PermissionManageEmployees)
	if err != nil {
		return err
	}

	var targetRole BusinessRole
	var current bool
	err = tx.QueryRow(ctx,
		`SELECT role, monitoring_enabled FROM memberships WHERE user_id = $1 AND business_id = $2 FOR UPDATE`,
		targetUserID, businessID,
	).Scan(&targetRole, &current)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if targetRole == RoleOwner || (actorRole == RoleAdmin && targetRole == RoleAdmin) {
		return ErrForbidden
	}
	if current == enabled {
		return tx.Commit(ctx)
	}

	if _, err := tx.Exec(ctx,
		`UPDATE memberships SET monitoring_enabled = $1 WHERE user_id = $2 AND business_id = $3`,
		enabled, targetUserID, businessID,
	); err != nil {
		return err
	}
	if err := insertAuditTx(ctx, tx, businessID, actorID, "member.monitoring_changed", "member", targetUserID, map[string]any{
		"enabled": enabled,
		"role":    string(targetRole),
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
