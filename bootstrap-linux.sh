#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="https://github.com/0xDive/emplooyee-tracking.git"

if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
  INSTALL_DIR="${BIBO_INSTALL_DIR:-/opt/bibotracking}"
else
  INSTALL_DIR="${BIBO_INSTALL_DIR:-$HOME/bibotracking}"
fi

need_root_cmd() {
  if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "ERROR: root privileges are required to install missing packages." >&2
    exit 1
  fi
}

if ! command -v git >/dev/null 2>&1; then
  echo "Installing git..."
  if command -v apt-get >/dev/null 2>&1; then
    need_root_cmd apt-get update
    need_root_cmd apt-get install -y git ca-certificates
  elif command -v dnf >/dev/null 2>&1; then
    need_root_cmd dnf install -y git ca-certificates
  elif command -v yum >/dev/null 2>&1; then
    need_root_cmd yum install -y git ca-certificates
  else
    echo "ERROR: git is missing and this distribution is not supported for automatic git installation." >&2
    exit 1
  fi
fi

if [[ -d "$INSTALL_DIR/.git" ]]; then
  echo "Updating existing checkout: $INSTALL_DIR"
  git -C "$INSTALL_DIR" fetch origin main
  git -C "$INSTALL_DIR" checkout main
  git -C "$INSTALL_DIR" pull --ff-only origin main
elif [[ -e "$INSTALL_DIR" ]]; then
  echo "ERROR: $INSTALL_DIR exists but is not a git checkout." >&2
  exit 1
else
  echo "Cloning BiBoTracking Corporate to $INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 --branch main "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
exec ./install-linux.sh "$@"
