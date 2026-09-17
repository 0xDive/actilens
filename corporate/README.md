# BiBoTracking Corporate

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
