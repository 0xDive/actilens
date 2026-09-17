# ActiLens

ActiLens is a self-hosted workstation activity monitoring and analytics platform.

## Features
- active application and window timeline
- active / idle time
- periodic screenshots
- browser activity
- employee administration and session revocation
- Russian and English UI
- Windows agent with autostart
- Go backend + PostgreSQL
- Docker deployment and optional HTTPS with Caddy

## Linux
```bash
git clone https://github.com/0xDive/actilens.git
cd actilens
./install-linux.sh --install-docker --open-firewall
```

## Operations
```bash
./actilensctl.sh status
./actilensctl.sh logs
./actilensctl.sh update
./actilensctl.sh backup
```

## License
MIT.
