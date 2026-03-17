#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Este script es solo para macOS."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "[clean] Eliminando dependencias y caches locales..."
TARGETS=(
  "backend/node_modules"
  "frontend/node_modules"
  "backend/dist"
  "frontend/.next"
)

for REL_PATH in "${TARGETS[@]}"; do
  ABS_PATH="${ROOT_DIR}/${REL_PATH}"
  if [[ -e "${ABS_PATH}" ]]; then
    rm -rf "${ABS_PATH}"
    echo "[clean] OK -> ${REL_PATH}"
  else
    echo "[clean] Omitido -> ${REL_PATH} (no existe)"
  fi
done

echo "[clean] Limpiando cache global de npm..."
npm cache clean --force >/dev/null 2>&1 || true

echo "[clean] Listo. Al ejecutar run-all, npm install se corre solo si falta node_modules."
