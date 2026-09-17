# BiBoTracking Corporate

This fork keeps upstream BiBoTracking source close to upstream and applies the internal corporate changes deterministically during CI/builds.

## Corporate changes

- Russian locale for web admin and desktop UI.
- Windows auto-start at user sign-in. The client stays visible in the system tray; this is not a stealth/spy mode.
- Self-host server URL can be baked into the Windows client via `CTRACKING_BUILD_SERVER_URL`.
- Employee administration: edit name/login, reset password, block/unblock, soft-delete/archive while keeping historical reports/screenshots.
- JWT session versioning: password reset or blocking revokes existing access/refresh sessions.
- Real employee presence/current-app data replaces the upstream placeholder status on the Employees page.
- Corporate desktop identity/version so it can coexist with the public client.
- Public `bibotracker.com` auto-updater is disabled in the corporate build.
- Self-host Docker image with PostgreSQL and persistent screenshot/JWT volumes.

## How the patch is stored

The original corporate patch payload is split across `patch.part1.b64` … `patch.part4.b64`.
`apply_patch.py` reconstructs it, verifies SHA-256, extracts it to a temporary directory and executes the patcher against the checked-out source tree.

Run locally from the repository root:

```bash
python3 corporate/apply_patch.py .
```

After this command the working tree contains the generated corporate source changes.

## GitHub Actions

### Corporate CI

`.github/workflows/corporate-ci.yml`

- runs backend tests/build;
- typechecks/builds the web admin;
- typechecks the desktop UI;
- on push (not PR) builds Windows x64 MSI/EXE;
- uploads the installers as GitHub Actions artifacts for 14 days.

### Corporate Release

`.github/workflows/corporate-release.yml`

Create a tag such as:

```bash
git tag corp-v1.5.2
git push origin corp-v1.5.2
```

GitHub will automatically:

1. build Windows `.exe` / `.msi`;
2. publish `ghcr.io/0xdive/emplooyee-tracking:latest` and the tag-specific image;
3. create a GitHub Release and attach the Windows installers.

## Server URL used by Windows CI builds

In the repository open:

`Settings -> Secrets and variables -> Actions -> Variables`

Create:

```text
CTRACKING_SERVER_URL=https://tracking.example.com
```

For an internal LAN test it can be something like:

```text
CTRACKING_SERVER_URL=http://192.168.1.50:8081
```

If the variable is missing, Actions uses `http://localhost:8081`. Runtime `CTRACKING_BACKEND_URL` can still override the baked URL for diagnostics.

## Self-host Docker

Local build:

```bash
docker compose -f corporate/docker-compose.yml up -d --build
```

Or after a tagged release, use the GHCR image:

```bash
BIBO_IMAGE=ghcr.io/0xdive/emplooyee-tracking:latest \
  docker compose -f corporate/docker-compose.yml up -d
```

Default admin URL is `http://localhost:8081/admin/`.

## Monitoring scope

The intended deployment is transparent monitoring on company-managed devices. The client records active apps/windows, active/idle time, periodic screenshots, keystroke counts (counts only, not typed content), and browser URLs when the browser extension is installed.
