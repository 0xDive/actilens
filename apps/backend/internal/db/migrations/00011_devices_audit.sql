-- +goose Up
ALTER TABLE devices
    ADD COLUMN hostname text,
    ADD COLUMN platform text,
    ADD COLUMN arch text,
    ADD COLUMN app_version text,
    ADD COLUMN first_seen_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN revoked_at timestamptz;

CREATE INDEX idx_devices_user_last_seen
    ON devices(user_id, last_seen_at DESC);
CREATE INDEX idx_devices_user_revoked
    ON devices(user_id, revoked_at)
    WHERE revoked_at IS NOT NULL;

CREATE TABLE audit_events (
    id            bigserial PRIMARY KEY,
    business_id   uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action        text NOT NULL,
    target_type   text NOT NULL,
    target_id     text,
    details       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_events_business_created
    ON audit_events(business_id, created_at DESC);

-- +goose Down
DROP TABLE audit_events;
DROP INDEX idx_devices_user_revoked;
DROP INDEX idx_devices_user_last_seen;
ALTER TABLE devices
    DROP COLUMN revoked_at,
    DROP COLUMN first_seen_at,
    DROP COLUMN app_version,
    DROP COLUMN arch,
    DROP COLUMN platform,
    DROP COLUMN hostname;
