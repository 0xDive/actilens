# ActiLens deployment

ActiLens is a self-hosted workstation activity monitoring and analytics platform.
The deployment stack serves the Go backend and web-admin together, backed by
PostgreSQL, with optional Caddy-managed HTTPS.

## Linux server

From a checkout:

```bash
./install-linux.sh --install-docker --open-firewall
```

For a fixed LAN address:

```bash
./install-linux.sh \
  --port 8081 \
  --origin http://192.168.0.249:8081 \
  --open-firewall
```

With a public DNS name and automatic HTTPS:

```bash
./install-linux.sh \
  --install-docker \
  --domain tracker.example.com \
  --open-firewall
```

For Internet/WAN deployments, use HTTPS rather than exposing the plain HTTP
application port publicly.

## Operations

```bash
./actilensctl.sh status
./actilensctl.sh logs
./actilensctl.sh restart
./actilensctl.sh update
./actilensctl.sh backup
./actilensctl.sh restore deploy/backups/<timestamp> --yes
./actilensctl.sh down
```

Backups contain the PostgreSQL dump, screenshot/config/log volumes and an
environment snapshot. The environment snapshot contains deployment secrets and
should be protected accordingly.

## Docker images

Every relevant change on `main` publishes:

```text
ghcr.io/0xdive/actilens:main
ghcr.io/0xdive/actilens:sha-<commit>
```

Versioned releases publish:

```text
ghcr.io/0xdive/actilens:v0.2.0
ghcr.io/0xdive/actilens:latest
```

The release workflow accepts `v*` tags and can also be started manually from
GitHub Actions with a semantic version such as `v0.2.0`.

## Windows deployment

Public release installers are server-agnostic. The backend is selected when the
agent is provisioned:

```powershell
.\install-windows-agent.ps1 `
  -ServerUrl "https://tracker.example.com" `
  -EnrollmentToken "atl_enroll_..."
```

The provisioning script stores `ACTILENS_BACKEND_URL` for the current Windows
user and launches the normal visible ActiLens application to redeem the one-time
enrollment code.

Custom Windows builds can still bake a default backend URL by setting
`ACTILENS_BUILD_SERVER_URL`; the runtime `ACTILENS_BACKEND_URL` value takes
precedence.

## Monitoring scope

ActiLens is intended for transparent use on organization-managed devices. Depending
on policy and user consent/settings it can record active applications/windows,
active/idle time, periodic screenshots, browser activity and keystroke counts.
Typed keystroke contents are not recorded.

Organizations deploying ActiLens are responsible for appropriate notice, consent,
access controls, retention policies and compliance with applicable law.
