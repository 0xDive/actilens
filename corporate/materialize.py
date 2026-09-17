#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()


def p(rel: str) -> Path:
    return root / rel


def replace(rel: str, old: str, new: str) -> None:
    path = p(rel)
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"materialize anchor missing in {rel}: {old[:100]!r}")
    path.write_text(text.replace(old, new), encoding="utf-8")


# Apply the already CI-verified corporate patch to the actual checkout.
subprocess.check_call([sys.executable, str(p("corporate/apply_patch.py")), str(root)])

# CI now builds the real modified source; no patch application step remains.
replace(
    ".github/workflows/corporate-ci.yml",
    "      - name: Apply corporate patch\n        run: python3 corporate/apply_patch.py .\n\n",
    "",
)
replace(
    ".github/workflows/corporate-ci.yml",
    "      - name: Apply corporate patch\n        shell: pwsh\n        run: python corporate/apply_patch.py .\n\n",
    "",
)
replace(
    ".github/workflows/corporate-release.yml",
    "      - name: Apply corporate patch\n        shell: pwsh\n        run: python corporate/apply_patch.py .\n\n",
    "",
)

# Build directly from the repository source.
p("corporate/Dockerfile").write_text('''# syntax=docker/dockerfile:1

FROM node:20-alpine AS web
WORKDIR /src
COPY . /src
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ctracking/web-admin build
RUN node marketing/build.mjs

FROM golang:1.26-alpine AS backend
WORKDIR /src
COPY apps/backend /src
RUN go mod download
ARG VERSION=corporate-dev
RUN CGO_ENABLED=0 GOOS=linux go build \\
    -trimpath \\
    -ldflags "-s -w -X ctracking/backend/internal/handlers.Version=${VERSION}" \\
    -o /out/server ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata \\
    && adduser -D -u 10001 app
WORKDIR /app
COPY --from=backend /out/server /app/server
COPY --from=web /src/marketing/site /app/static
COPY --from=web /src/apps/web-admin/dist /app/static/admin
COPY corporate/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN mkdir -p /app/storage/screenshots /app/config /app/logs \\
    && chown -R app:app /app \\
    && chmod +x /app/docker-entrypoint.sh
USER app
EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
''', encoding="utf-8")

# Documentation: corporate changes are now normal source code, not a generated overlay.
p("corporate/README.md").write_text('''# BiBoTracking Corporate

This fork contains the corporate changes directly in the application source under `apps/`.
There is no runtime/build-time patch layer.

## Included changes

- Russian locale for web admin and desktop UI.
- Windows auto-start at user sign-in; the client remains visible in the system tray.
- Self-host backend URL can be baked into the Windows client with `CTRACKING_BUILD_SERVER_URL`.
- Employee administration: edit login/name, reset password, block/unblock and soft-delete/archive while preserving reports/screenshots.
- JWT session versioning: password reset or blocking revokes existing sessions.
- Real employee presence/current-app data instead of the upstream placeholder status.
- Corporate desktop identity/version and disabled public `bibotracker.com` updater.
- Self-host Docker + PostgreSQL, optional Caddy HTTPS, backups and one-command Linux installation.

## Linux server

From a checkout:

```bash
./install-linux.sh --install-docker --open-firewall
```

With a public domain and automatic HTTPS:

```bash
./install-linux.sh --install-docker --domain tracker.example.com --open-firewall
```

Server management:

```bash
./biboctl.sh status
./biboctl.sh logs
./biboctl.sh update
./biboctl.sh backup
./biboctl.sh restart
./biboctl.sh down
```

## Docker image

`main` is published automatically to:

```text
ghcr.io/0xdive/emplooyee-tracking:main
```

Tagged releases (`corp-v*`) also publish versioned images and Windows `.exe` / `.msi` assets.

## Windows build server URL

Create the repository Actions variable:

```text
CTRACKING_SERVER_URL=https://tracker.example.com
```

The runtime environment variable `CTRACKING_BACKEND_URL` still overrides the baked value for diagnostics/migrations.

## Monitoring scope

This fork is intended for transparent monitoring on company-managed devices. It records active applications/windows, active/idle time, periodic screenshots, browser URLs when the extension is installed, and keystroke **counts only** (never the typed content).
''', encoding="utf-8")

# README language count reflects the new committed Russian locale.
readme = p("README.md").read_text(encoding="utf-8")
readme = readme.replace(
    "- 🌍 **7 languages** — English, 简体中文, 日本語, Tiếng Việt, Bahasa Indonesia, Français, Español.",
    "- 🌍 **8 languages** — English, Русский, 简体中文, 日本語, Tiếng Việt, Bahasa Indonesia, Français, Español.",
)
p("README.md").write_text(readme, encoding="utf-8")

# Delete the overlay payload. Deployment files under corporate/ stay.
for rel in [
    "corporate/apply_patch.py",
    "corporate/patch.part1.b64",
    "corporate/patch.part2.b64",
    "corporate/patch.part3.b64",
    "corporate/patch.part4.b64",
    "corporate/materialize.py",
    ".github/workflows/materialize-source.yml",
]:
    path = p(rel)
    if path.exists():
        path.unlink()

print("Corporate changes materialized directly into source code.")
