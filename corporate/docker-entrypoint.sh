#!/bin/sh
set -eu

SECRET_FILE=/app/config/jwt_secret
if [ ! -s "$SECRET_FILE" ]; then
  umask 077
  tr -dc 'A-Za-z0-9' </dev/urandom | head -c 80 > "$SECRET_FILE" || true
  if [ "$(wc -c < "$SECRET_FILE" | tr -d ' ')" -lt 64 ]; then
    dd if=/dev/urandom bs=48 count=1 2>/dev/null | base64 | tr -d '\n' > "$SECRET_FILE"
  fi
fi

export JWT_SECRET="$(cat "$SECRET_FILE")"
exec /app/server
