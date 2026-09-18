package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

const (
	MemberStatusActive  = "active"
	MemberStatusBlocked = "blocked"
	MemberStatusRemoved = "removed"
)

func canManageLifecycleTarget(actorRole, targetRole BusinessRole) bool {
	if targetRole == RoleOwner {
		return false
	}
	if actorRole == RoleAdmin && targetRole == RoleAdmin {
		return false
	}
	return actorRole == RoleOwner || actorRole == RoleAdmin
}

func (s *Store) setMemberStatus(
	ctx context.Context,
	actorID, businessID, targetUserID, nextStatus string,
	restoreMonitoring *bool,
) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	actorRole, err := requireBusinessPermissionTx(
		ctx, tx, actorID, businessID, CapabilityMembersManage,
	)
	if err != nil {
		return err
	}

	var targetRole BusinessRole
	var currentStatus string
	var currentMonitoring bool
	err = tx.QueryRow(ctx, `
		SELECT role, status, monitoring_enabled
		  FROM memberships
		 WHERE user_id = $1 AND business_id = $2
		 FOR UPDATE`,
		targetUserID, businessID,
	).Scan(&targetRole, &currentStatus, &currentMonitoring)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if !canManageLifecycleTarget(actorRole, targetRole) {
		return ErrForbidden
	}

	switch nextStatus {
	case MemberStatusBlocked:
		if currentStatus == MemberStatusRemoved {
			return ErrConflict
		}
		if currentStatus == MemberStatusBlocked {
			return tx.Commit(ctx)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE memberships
			   SET status = 'blocked',
			       blocked_at = now(),
			       removed_at = NULL,
			       updated_at = now()
			 WHERE user_id = $1 AND business_id = $2`,
			targetUserID, businessID,
		); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE enrollment_tokens
			   SET revoked_at = COALESCE(revoked_at, now())
			 WHERE user_id = $1 AND business_id = $2
			   AND used_at IS NULL AND revoked_at IS NULL`,
			targetUserID, businessID,
		); err != nil {
			return err
		}
		if err := insertAuditTx(ctx, tx, businessID, actorID, "member.blocked", "member", targetUserID, map[string]any{
			"role": string(targetRole),
		}); err != nil {
			return err
		}

	case MemberStatusActive:
		if currentStatus == MemberStatusRemoved {
			if restoreMonitoring == nil {
				return ErrConflict
			}
			if _, err := tx.Exec(ctx, `
				UPDATE memberships
				   SET status = 'active',
				       role = 'employee',
				       monitoring_enabled = $1,
				       blocked_at = NULL,
				       removed_at = NULL,
				       updated_at = now()
				 WHERE user_id = $2 AND business_id = $3`,
				*restoreMonitoring, targetUserID, businessID,
			); err != nil {
				return err
			}
			if err := insertAuditTx(ctx, tx, businessID, actorID, "member.restored", "member", targetUserID, map[string]any{
				"role":               "employee",
				"monitoring_enabled": *restoreMonitoring,
				"previous_role":      string(targetRole),
			}); err != nil {
				return err
			}
		} else if currentStatus == MemberStatusBlocked {
			if _, err := tx.Exec(ctx, `
				UPDATE memberships
				   SET status = 'active',
				       blocked_at = NULL,
				       updated_at = now()
				 WHERE user_id = $1 AND business_id = $2`,
				targetUserID, businessID,
			); err != nil {
				return err
			}
			if err := insertAuditTx(ctx, tx, businessID, actorID, "member.unblocked", "member", targetUserID, map[string]any{
				"role": string(targetRole),
			}); err != nil {
				return err
			}
		} else {
			return tx.Commit(ctx)
		}

	case MemberStatusRemoved:
		if currentStatus == MemberStatusRemoved {
			return tx.Commit(ctx)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE memberships
			   SET status = 'removed',
			       monitoring_enabled = false,
			       blocked_at = NULL,
			       removed_at = now(),
			       updated_at = now()
			 WHERE user_id = $1 AND business_id = $2`,
			targetUserID, businessID,
		); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE enrollment_tokens
			   SET revoked_at = COALESCE(revoked_at, now())
			 WHERE user_id = $1 AND business_id = $2
			   AND used_at IS NULL AND revoked_at IS NULL`,
			targetUserID, businessID,
		); err != nil {
			return err
		}
		if err := insertAuditTx(ctx, tx, businessID, actorID, "member.removed", "member", targetUserID, map[string]any{
			"previous_role":               string(targetRole),
			"previous_monitoring_enabled": currentMonitoring,
		}); err != nil {
			return err
		}

	default:
		return ErrConflict
	}

	return tx.Commit(ctx)
}

func (s *Store) BlockMember(ctx context.Context, actorID, businessID, targetUserID string) error {
	return s.setMemberStatus(ctx, actorID, businessID, targetUserID, MemberStatusBlocked, nil)
}

func (s *Store) UnblockMember(ctx context.Context, actorID, businessID, targetUserID string) error {
	return s.setMemberStatus(ctx, actorID, businessID, targetUserID, MemberStatusActive, nil)
}

func (s *Store) RemoveMember(ctx context.Context, actorID, businessID, targetUserID string) error {
	return s.setMemberStatus(ctx, actorID, businessID, targetUserID, MemberStatusRemoved, nil)
}

func (s *Store) RestoreMember(
	ctx context.Context,
	actorID, businessID, targetUserID string,
	monitoringEnabled bool,
) error {
	return s.setMemberStatus(
		ctx, actorID, businessID, targetUserID, MemberStatusActive, &monitoringEnabled,
	)
}

func (s *Store) MembershipStatus(
	ctx context.Context,
	userID, businessID string,
) (string, error) {
	var status string
	err := s.pool.QueryRow(ctx, `
		SELECT status FROM memberships
		 WHERE user_id = $1 AND business_id = $2`,
		userID, businessID,
	).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return status, err
}
