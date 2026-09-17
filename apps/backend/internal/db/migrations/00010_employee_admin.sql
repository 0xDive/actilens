-- +goose Up
-- Corporate employee administration. Archiving keeps historical activity and
-- screenshots intact while preventing future login/refresh.
ALTER TABLE users ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN disabled_at timestamptz;
ALTER TABLE users ADD COLUMN auth_version integer NOT NULL DEFAULT 1;

-- +goose Down
ALTER TABLE users DROP COLUMN auth_version;
ALTER TABLE users DROP COLUMN disabled_at;
ALTER TABLE users DROP COLUMN active;
