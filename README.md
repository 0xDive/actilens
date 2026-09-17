# ActiLens

ActiLens is a self-hosted workstation activity monitoring and analytics platform.

## Features
- active application and window timeline
- active / idle time
- periodic screenshots
- browser activity
- employee administration, roles, devices and session revocation
- Russian and English UI
- Windows agent with autostart
- Go backend + PostgreSQL
- Docker deployment and optional HTTPS with Caddy

## Linux server

```bash
git clone https://github.com/0xDive/actilens.git
cd actilens
./install-linux.sh --install-docker --open-firewall
```

For a fixed LAN address:

```bash
./install-linux.sh \
  --port 8081 \
  --origin http://192.168.0.249:8081 \
  --open-firewall
```

Admin console:

```text
http://192.168.0.249:8081/admin/
```

## Windows client

The backend URL is baked into release/custom Windows builds with
`ACTILENS_BUILD_SERVER_URL`.

### Build locally on Windows

```powershell
.\build-windows-client.ps1 -ServerUrl "http://192.168.0.249:8081"
```

The resulting `.exe` and `.msi` files are copied to `dist-windows\`.

### Build in GitHub Actions

Open **Actions → Build Custom Windows Client → Run workflow** and enter the server
URL, for example:

```text
http://192.168.0.249:8081
```

The workflow uploads the MSI/EXE as a GitHub Actions artifact.

### Production releases

Repository variable `ACTILENS_SERVER_URL` is required for tagged releases. Example:

```text
ACTILENS_SERVER_URL=http://192.168.0.249:8081
```

For Internet/WAN deployments, use an HTTPS URL such as
`https://tracker.example.com` instead of exposing plain HTTP publicly.

CI validation builds intentionally use `http://127.0.0.1:8081` and never inherit the
production server address.

## Operations

```bash
./actilensctl.sh status
./actilensctl.sh logs
./actilensctl.sh update
./actilensctl.sh backup
```

## License
MIT.
