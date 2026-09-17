#!/usr/bin/env bash
# Start a local Postgres for the actilens backend (Docker). Idempotent: creates
# the container on first run, starts it on later runs. Matches apps/backend/.env*.example.
#
# One container, one separate database PER ENVIRONMENT so dev/staging/prod never
# share state when run locally:
#   actilens          → dev/local   (apps/backend/.env.example)
#   actilens_staging  → staging     (apps/backend/.env.staging.example)
#   actilens_prod     → production  (apps/backend/.env.prod.example)
set -euo pipefail

NAME=actilens-dev-db
PORT=5432
# Per-env databases created alongside the default `actilens` (the container's
# POSTGRES_DB). Keep in sync with the apps/backend/.env*.example files.
ENV_DBS=(actilens_staging actilens_prod)

if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  echo "→ starting existing container $NAME"
  docker start "$NAME" >/dev/null
else
  echo "→ creating container $NAME on :$PORT"
  docker run -d --name "$NAME" \
    -e POSTGRES_USER=actilens \
    -e POSTGRES_PASSWORD=actilens \
    -e POSTGRES_DB=actilens \
    -p "$PORT:5432" \
    postgres:16 >/dev/null
fi

echo -n "→ waiting for Postgres to accept connections"
until docker exec "$NAME" pg_isready -U actilens -d actilens >/dev/null 2>&1; do
  echo -n "."
  sleep 1
done
echo " ready."

# Create one database per environment (idempotent — skip if it already exists).
for db in "${ENV_DBS[@]}"; do
  if docker exec "$NAME" psql -U actilens -tAc \
       "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -qx 1; then
    echo "→ database $db already exists"
  else
    echo "→ creating database $db"
    docker exec "$NAME" createdb -U actilens "$db"
  fi
done

echo "   DSNs (one db per env):"
echo "     dev/local  postgres://actilens:actilens@localhost:$PORT/actilens?sslmode=disable"
echo "     staging    postgres://actilens:actilens@localhost:$PORT/actilens_staging?sslmode=disable"
echo "     production postgres://actilens:actilens@localhost:$PORT/actilens_prod?sslmode=disable"
echo "   (stop with: docker stop $NAME   ·   wipe with: docker rm -f $NAME)"
