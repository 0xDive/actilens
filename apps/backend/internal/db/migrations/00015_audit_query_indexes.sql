-- +goose Up
-- Audit history is retained long-term and queried by action and participant.
-- Keep these indexes narrow and organization-scoped so filters stay predictable
-- without indexing the potentially large JSON details payload.
CREATE INDEX idx_audit_events_business_action_created
    ON audit_events(business_id, action, created_at DESC, id DESC);

CREATE INDEX idx_audit_events_business_actor_created
    ON audit_events(business_id, actor_user_id, created_at DESC, id DESC);

CREATE INDEX idx_audit_events_business_target_created
    ON audit_events(business_id, target_id, created_at DESC, id DESC)
    WHERE target_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_audit_events_business_target_created;
DROP INDEX IF EXISTS idx_audit_events_business_actor_created;
DROP INDEX IF EXISTS idx_audit_events_business_action_created;
