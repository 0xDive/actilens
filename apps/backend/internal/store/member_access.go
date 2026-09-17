package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// MemberAccess describes the shared organization through which an actor may act
// on another member. It is deliberately resolved server-side; clients never get
// to choose an arbitrary business to elevate their permissions.
type MemberAccess struct {
	BusinessID string
	ActorRole  BusinessRole
	TargetRole BusinessRole
}

func roleMayManageTarget(actor, target BusinessRole, permission BusinessPermission) bool {
	if !roleAllows(actor, permission) {
		return false
	}
	if permission == PermissionManageEmployees || permission == PermissionManageDevices {
		// Employee-management APIs never mutate the organization owner. Admins may
		// manage managers/employees, but not peer admins.
		if target == RoleOwner {
			return false
		}
		if actor == RoleAdmin && target == RoleAdmin {
			return false
		}
	}
	return true
}

func memberAccessRows(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, actorID, targetID string, permission BusinessPermission) (MemberAccess, error) {
	rows, err := q.Query(ctx, `
		SELECT target.business_id, actor.role, target.role
		  FROM memberships target
		  JOIN memberships actor ON actor.business_id = target.business_id
		 WHERE actor.user_id = $1 AND target.user_id = $2
		 ORDER BY (actor.role = 'owner') DESC, target.created_at`, actorID, targetID)
	if err != nil {
		return MemberAccess{}, err
	}
	defer rows.Close()

	foundShared := false
	for rows.Next() {
		foundShared = true
		var access MemberAccess
		if err := rows.Scan(&access.BusinessID, &access.ActorRole, &access.TargetRole); err != nil {
			return MemberAccess{}, err
		}
		if roleMayManageTarget(access.ActorRole, access.TargetRole, permission) {
			return access, nil
		}
	}
	if err := rows.Err(); err != nil {
		return MemberAccess{}, err
	}
	if foundShared {
		return MemberAccess{}, ErrForbidden
	}
	return MemberAccess{}, ErrNotFound
}

// MemberAccessWithPermission resolves a shared business and validates the actor's
// permission for an action on targetID.
func (s *Store) MemberAccessWithPermission(ctx context.Context, actorID, targetID string, permission BusinessPermission) (MemberAccess, error) {
	return memberAccessRows(ctx, s.pool, actorID, targetID, permission)
}

// MemberBelongsToBusiness reports whether a user is a member of a specific org.
func (s *Store) MemberBelongsToBusiness(ctx context.Context, userID, businessID string) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM memberships WHERE user_id = $1 AND business_id = $2)`,
		userID, businessID).Scan(&ok)
	return ok, err
}

// BusinessPermissionOrForbidden is a convenience for mutation stores that want a
// typed forbidden error rather than a bool.
func (s *Store) BusinessPermissionOrForbidden(ctx context.Context, actorID, businessID string, permission BusinessPermission) error {
	ok, err := s.HasBusinessPermission(ctx, actorID, businessID, permission)
	if err != nil {
		return err
	}
	if !ok {
		return ErrForbidden
	}
	return nil
}

// memberAccessTx is the transaction-scoped equivalent used when authorization and
// mutation must be atomic.
func memberAccessTx(ctx context.Context, tx pgx.Tx, actorID, targetID string, permission BusinessPermission) (MemberAccess, error) {
	access, err := memberAccessRows(ctx, tx, actorID, targetID, permission)
	if errors.Is(err, ErrNotFound) {
		return MemberAccess{}, ErrNotFound
	}
	return access, err
}
