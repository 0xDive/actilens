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

## Linux server — recommended deployment

### LAN / VPN deployment

```bash
git clone https://github.com/0xDive/emplooyee-tracking.git
cd emplooyee-tracking
./install-linux.sh --install-docker --open-firewall
```

Defaults:

- HTTP port: `8081`
- PostgreSQL is private inside Docker (not published to the host)
- random PostgreSQL password is generated into `corporate/.env`
- JWT signing secret is generated once and persisted in the `appconfig` Docker volume
- app image: `ghcr.io/0xdive/emplooyee-tracking:main`
- if the prebuilt image cannot be pulled, the installer builds locally from this checkout

### Public server with automatic HTTPS

Create an A/AAAA DNS record pointing to the server and make TCP 80/443 reachable:

```bash
./install-linux.sh --install-docker --domain tracker.example.com --open-firewall
```

This adds the Caddy compose overlay. Caddy obtains and renews the TLS certificate automatically.
The application itself is bound to `127.0.0.1:8081`; external traffic enters through Caddy.

### Server maintenance

```bash
./biboctl.sh status
./biboctl.sh logs
./biboctl.sh logs caddy
./biboctl.sh restart
./biboctl.sh update
./biboctl.sh backup
./biboctl.sh down
```

Restore a backup deliberately with:

```bash
./biboctl.sh restore corporate/backups/YYYYMMDD-HHMMSS --yes
```

`down` removes containers/networks but keeps named volumes. Do **not** use `docker compose down -v`
unless you explicitly intend to delete PostgreSQL, screenshots and persisted app configuration.

## How the patch is stored

The corporate patch payload is split across `patch.part1.b64` … `patch.part4.b64`.
`apply_patch.py` reconstructs it, verifies SHA-256, extracts it to a temporary directory and executes the patcher against the checked-out source tree.

Run locally from the repository root:

```bash
python3 corporate/apply_patch.py .
```

After this command the working tree contains the generated corporate source changes.

## GitHub Actions

### Corporate CI

`.github/workflows/corporate-ci.yml`

- validates Linux shell scripts and both Compose configurations;
- runs backend tests/build;
- typechecks/builds the web admin;
- typechecks the desktop UI;
- on push (not PR) builds Windows x64 MSI/EXE;
- uploads installers as GitHub Actions artifacts.

### Main Linux server image

`.github/workflows/server-image.yml`

Relevant changes on `main` automatically build and publish:

```text
ghcr.io/0xdive/emplooyee-tracking:main
```

A commit-specific `sha-*` image is also published. `install-linux.sh` uses `:main` by default.

### Tagged corporate release

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
CTRACKING_SERVER_URL=https://tracker.example.com
```

For an internal LAN test it can be something like:

```text
CTRACKING_SERVER_URL=http://192.168.1.50:8081
```

If the variable is missing, Actions uses `http://localhost:8081`. Runtime `CTRACKING_BACKEND_URL` can still override the baked URL for diagnostics.

## Manual Docker commands

The one-command installer is preferred, but the stack can also be operated directly:

```bash
cp corporate/.env.example corporate/.env
# Edit corporate/.env first — especially POSTGRES_PASSWORD and PUBLIC_ORIGIN.
docker compose --env-file corporate/.env -f corporate/docker-compose.yml up -d --build
```

For HTTPS:

```bash
docker compose --env-file corporate/.env \
  -f corporate/docker-compose.yml \
  -f corporate/docker-compose.https.yml up -d
```

## Monitoring scope

The intended deployment is transparent monitoring on company-managed devices. The client records active apps/windows, active/idle time, periodic screenshots, keystroke counts (counts only, not typed content), and browser URLs when the browser extension is installed.
