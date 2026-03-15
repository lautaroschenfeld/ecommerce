#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Este script es solo para macOS."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_SCRIPT="${SCRIPT_DIR}/run-backend-mac.sh"
FRONTEND_SCRIPT="${SCRIPT_DIR}/run-frontend-mac.sh"
FREE_PORTS_SCRIPT="${SCRIPT_DIR}/free-ports-mac.sh"
DOCKER_WAIT_SECONDS="${DOCKER_WAIT_SECONDS:-120}"

for required in "${BACKEND_SCRIPT}" "${FRONTEND_SCRIPT}" "${FREE_PORTS_SCRIPT}"; do
  if [[ ! -f "${required}" ]]; then
    echo "[dev] No se encontro ${required}"
    exit 1
  fi
done

docker_daemon_ready() {
  if ! command -v docker >/dev/null 2>&1; then
    return 1
  fi
  docker info >/dev/null 2>&1
}

ensure_docker_running() {
  if docker_daemon_ready; then
    echo "[dev] Docker daemon listo."
    return 0
  fi

  echo "[dev] Docker daemon no disponible. Iniciando Docker Desktop..."
  open -ga Docker >/dev/null 2>&1 || open -a Docker >/dev/null 2>&1 || true

  echo "[dev] Esperando a que Docker quede listo..."
  for _ in $(seq 1 "${DOCKER_WAIT_SECONDS}"); do
    if docker_daemon_ready; then
      echo "[dev] Docker daemon listo."
      return 0
    fi
    sleep 1
  done

  echo "[dev] Docker no responde despues de ${DOCKER_WAIT_SECONDS}s."
  exit 1
}

ensure_docker_running

echo "[dev] Preparando puertos requeridos (9000, 3000, 3001)..."
bash "${FREE_PORTS_SCRIPT}" 9000 3000 3001

echo "[dev] Levantando postgres con Docker..."
(
  cd "${ROOT_DIR}"
  docker compose -f docker-compose.yml up -d postgres
)

BACKEND_CMD="bash \\\"${BACKEND_SCRIPT}\\\""
FRONTEND_CMD="bash \\\"${FRONTEND_SCRIPT}\\\""

echo "[dev] Abriendo 2 ventanas de Terminal (backend y frontend)..."
/usr/bin/osascript <<EOF
tell application "Terminal"
  activate
  do script "${BACKEND_CMD}"
  delay 3
  do script "${FRONTEND_CMD}"
end tell
EOF

echo "[dev] Listo. Revisa las 2 ventanas de Terminal."
