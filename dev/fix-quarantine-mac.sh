#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Este script es solo para macOS."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "[quarantine] Limpiando cuarentena en backend y frontend..."
for APP_DIR in backend frontend; do
  TARGET_DIR="${ROOT_DIR}/${APP_DIR}"
  if [[ -d "${TARGET_DIR}" ]]; then
    xattr -dr com.apple.quarantine "${TARGET_DIR}" 2>/dev/null || true
    echo "[quarantine] OK -> ${APP_DIR}"
  else
    echo "[quarantine] Omitido -> ${APP_DIR} (no existe)"
  fi
done

echo "[quarantine] Asegurando permisos ejecutables en node_modules/.bin..."
for APP_DIR in backend frontend; do
  BIN_DIR="${ROOT_DIR}/${APP_DIR}/node_modules/.bin"
  if [[ -d "${BIN_DIR}" ]]; then
    find "${BIN_DIR}" -type f -exec chmod +x {} \;
    echo "[quarantine] permisos +x -> ${APP_DIR}/node_modules/.bin"
  fi
done

echo "[quarantine] Listo."
