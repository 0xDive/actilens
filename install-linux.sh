#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT/corporate/.env"
COMPOSE_FILE="$ROOT/corporate/docker-compose.yml"

PORT="8081"
ORIGIN=""
IMAGE="ghcr.io/0xdive/emplooyee-tracking:main"
LOCAL_BUILD=0
INSTALL_DOCKER=0
OPEN_FIREWALL=0

usage() {
  cat <<'EOF'
BiBoTracking Corporate — one-command Linux installer

Usage:
  ./install-linux.sh [options]

Options:
  --port N               Published HTTP port (default: 8081)
  --origin URL           Public URL, e.g. https://tracker.example.com
  --image IMAGE          Docker image (default: ghcr.io/0xdive/emplooyee-tracking:main)
  --local-build          Always build the app image from this checkout
  --install-docker       Install Docker using Docker's official installer if missing
  --open-firewall        If UFW is active, allow the selected TCP port
  -h, --help             Show this help

Examples:
  ./install-linux.sh
  ./install-linux.sh --port 8081 --open-firewall
  ./install-linux.sh --origin https://tracker.example.com
  sudo ./install-linux.sh --install-docker --open-firewall
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="${2:?missing port}"; shift 2 ;;
    --origin) ORIGIN="${2:?missing origin}"; shift 2 ;;
    --image) IMAGE="${2:?missing image}"; shift 2 ;;
    --local-build) LOCAL_BUILD=1; shift ;;
    --install-docker) INSTALL_DOCKER=1; shift ;;
    --open-firewall) OPEN_FIREWALL=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "ERROR: this installer is for Linux." >&2
  exit 1
fi

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
  echo "ERROR: invalid port: $PORT" >&2
  exit 1
fi

need_root_cmd() {
  if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "ERROR: root privileges are required for: $*" >&2
    exit 1
  fi
}

install_docker() {
  echo "Docker is not installed. Installing Docker Engine..."
  if ! command -v curl >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
      need_root_cmd apt-get update
      need_root_cmd apt-get install -y ca-certificates curl
    elif command -v dnf >/dev/null 2>&1; then
      need_root_cmd dnf install -y curl ca-certificates
    elif command -v yum >/dev/null 2>&1; then
      need_root_cmd yum install -y curl ca-certificates
    else
      echo "ERROR: curl is required to install Docker automatically." >&2
      exit 1
    fi
  fi
  local tmp
  tmp="$(mktemp)"
  curl -fsSL https://get.docker.com -o "$tmp"
  need_root_cmd sh "$tmp"
  rm -f "$tmp"
  need_root_cmd systemctl enable --now docker 2>/dev/null || true
}

if ! command -v docker >/dev/null 2>&1; then
  if (( INSTALL_DOCKER )); then
    install_docker
  else
    echo "ERROR: Docker is not installed." >&2
    echo "Run: sudo ./install-linux.sh --install-docker" >&2
    exit 1
  fi
fi

DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
    DOCKER=(sudo docker)
  else
    echo "ERROR: cannot connect to the Docker daemon." >&2
    echo "Check that Docker is running and your user can access it." >&2
    exit 1
  fi
fi

if ! "${DOCKER[@]}" compose version >/dev/null 2>&1; then
  echo "ERROR: Docker Compose v2 plugin is required ('docker compose')." >&2
  exit 1
fi

compose() {
  "${DOCKER[@]}" compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
  fi
}

detect_ip() {
  local ip=""
  if command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  if [[ -z "$ip" ]] && command -v ip >/dev/null 2>&1; then
    ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')"
  fi
  printf '%s' "${ip:-127.0.0.1}"
}

set_env_value() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  awk -v key="$key" -v value="$value" '
    BEGIN { found=0 }
    $0 ~ ("^" key "=") { print key "=" value; found=1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "$ENV_FILE" > "$tmp"
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
  chmod 600 "$ENV_FILE"
}

if [[ -z "$ORIGIN" ]]; then
  ORIGIN="http://$(detect_ip):$PORT"
fi

mkdir -p "$ROOT/corporate/backups"

if [[ ! -f "$ENV_FILE" ]]; then
  DB_PASSWORD="$(random_hex)"
  cat > "$ENV_FILE" <<EOF
POSTGRES_USER=ctracking
POSTGRES_DB=ctracking
POSTGRES_PASSWORD=$DB_PASSWORD
BIBO_PORT=$PORT
PUBLIC_ORIGIN=$ORIGIN
BIBO_IMAGE=$IMAGE
EOF
  chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE with a random database password."
else
  echo "Using existing $ENV_FILE (existing database settings were preserved)."
  set_env_value BIBO_PORT "$PORT"
  set_env_value PUBLIC_ORIGIN "$ORIGIN"
  set_env_value BIBO_IMAGE "$IMAGE"
fi

if (( OPEN_FIREWALL )) && command -v ufw >/dev/null 2>&1; then
  if need_root_cmd ufw status 2>/dev/null | grep -q '^Status: active'; then
    need_root_cmd ufw allow "$PORT/tcp"
  fi
fi

echo
echo "Starting BiBoTracking Corporate..."
compose pull db >/dev/null

if (( LOCAL_BUILD )); then
  compose build --pull bibotracking
  compose up -d
else
  if compose pull bibotracking; then
    compose up -d --no-build
  else
    echo "Prebuilt image could not be pulled; falling back to a local source build."
    compose build --pull bibotracking
    compose up -d
  fi
fi

echo "Waiting for health check..."
health_url="http://127.0.0.1:$PORT/healthz"
ok=0
for _ in $(seq 1 60); do
  if command -v curl >/dev/null 2>&1; then
    if curl -fsS "$health_url" >/dev/null 2>&1; then ok=1; break; fi
  elif command -v wget >/dev/null 2>&1; then
    if wget -qO- "$health_url" >/dev/null 2>&1; then ok=1; break; fi
  else
    state="$("${DOCKER[@]}" inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' bibotracking 2>/dev/null || true)"
    if [[ "$state" == "healthy" || "$state" == "running" ]]; then ok=1; break; fi
  fi
  sleep 2
done

if (( ! ok )); then
  echo "ERROR: server did not become healthy." >&2
  compose ps >&2 || true
  compose logs --tail=120 bibotracking >&2 || true
  exit 1
fi

echo
echo "============================================================"
echo "BiBoTracking Corporate is running."
echo "Admin:  $ORIGIN/admin/"
echo "Health: $ORIGIN/healthz"
echo "Config: $ENV_FILE"
echo "============================================================"
echo
echo "Useful commands:"
echo "  ./biboctl.sh status"
echo "  ./biboctl.sh logs"
echo "  ./biboctl.sh update"
echo "  ./biboctl.sh backup"
