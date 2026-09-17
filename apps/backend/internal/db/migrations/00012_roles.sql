-- +goose Up
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
ALTER TABLE memberships
    ADD CONSTRAINT memberships_role_check
    CHECK (role IN ('owner', 'admin', 'manager', 'employee'));

ALTER TABLE memberships
    ADD COLUMN monitoring_enabled boolean NOT NULL DEFAULT true;

CREATE INDEX idx_memberships_user_role
    ON memberships(user_id, role, business_id);

-- +goose Down
DROP INDEX idx_memberships_user_role;
ALTER TABLE memberships DROP COLUMN monitoring_enabled;
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
ALTER TABLE memberships
    ADD CONSTRAINT memberships_role_check
    CHECK (role IN ('owner', 'employee'));
