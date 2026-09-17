#!/usr/bin/env bash
# Run the desktop app (Tauri dev). Points it at the web-admin dev server so BOTH
# its API calls (Vite proxies /v1 → backend :8090) AND the "Sign up on the web →"
# link (→ /admin/signup) resolve in one knob. Override ACTILENS_BACKEND_URL to
# hit the backend (:8090) directly instead.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/desktop"

export ACTILENS_BACKEND_URL="${ACTILENS_BACKEND_URL:-http://localhost:5174}"
echo "→ desktop (tauri dev) → backend at $ACTILENS_BACKEND_URL"
echo "   first build compiles Rust — give it a minute."
pnpm tauri dev
