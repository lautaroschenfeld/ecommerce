#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_SCRIPT="${SCRIPT_DIR}/dev/run-all-mac.sh"

echo "[launcher] Ejecutando run-all para macOS..."

if [[ ! -f "${TARGET_SCRIPT}" ]]; then
  echo "[launcher] ERROR: no existe ${TARGET_SCRIPT}"
  read -r -p "Presiona Enter para cerrar..."
  exit 1
fi

bash "${TARGET_SCRIPT}"
STATUS=$?

echo
if [[ ${STATUS} -ne 0 ]]; then
  echo "[launcher] Finalizo con error (exit code: ${STATUS})."
  echo "[launcher] Verifica que Docker Desktop este abierto y listo."
else
  echo "[launcher] Finalizo correctamente."
fi

read -r -p "Presiona Enter para cerrar..."
exit "${STATUS}"
