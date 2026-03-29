#!/usr/bin/env bash
set -euo pipefail

OS=$(uname -s)

case "$OS" in
  Darwin)
    HOST_HOME="/Users"
    ;;
  Linux)
    HOST_HOME="/home"
    ;;
  *)
    HOST_HOME="$(dirname "$HOME")"
    ;;
esac

export HOST_HOME
export HOST_LOGS="${HOST_LOGS:-/var/log}"

echo "[Specters] Detected OS: $OS — mounting $HOST_HOME as home volume"
exec docker compose up "$@"
