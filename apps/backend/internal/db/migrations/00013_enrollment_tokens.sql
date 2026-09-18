-- +goose Up
CREATE TABLE enrollment_tokens (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash      text NOT NULL UNIQUE,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id     uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    created_by      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    auth_version    integer NOT NULL,
    expires_at      timestamptz NOT NULL,
    used_at         timestamptz,
    revoked_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_enrollment_tokens_member
    ON enrollment_tokens(business_id, user_id, created_at DESC);
CREATE INDEX idx_enrollment_tokens_active
    ON enrollment_tokens(token_hash)
    WHERE used_at IS NULL AND revoked_at IS NULL;

-- +goose Down
DROP TABLE enrollment_tokens;
