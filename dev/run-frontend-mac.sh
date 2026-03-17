#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Este script es solo para macOS."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
FREE_PORTS_SCRIPT="${SCRIPT_DIR}/free-ports-mac.sh"

if [[ ! -f "${FREE_PORTS_SCRIPT}" ]]; then
  echo "[dev] No se encontro ${FREE_PORTS_SCRIPT}"
  exit 1
fi

cd "${ROOT_DIR}/frontend"

if [[ ! -d node_modules || ! -x node_modules/.bin/next ]]; then
  echo "[dev] Dependencias frontend faltantes o incompletas. Instalando..."
  npm install
fi

if [[ -d node_modules/.bin ]]; then
  find node_modules/.bin -type f -exec chmod +x {} \; >/dev/null 2>&1 || true
fi

if [[ ! -x node_modules/.bin/next ]]; then
  echo "[dev] Falta next en frontend aun despues de npm install."
  echo "[dev] Ejecuta manualmente: cd frontend && npm install"
  exit 1
fi

echo "[dev] Liberando puertos 3000 y 3001..."
bash "${FREE_PORTS_SCRIPT}" 3000 3001

if [[ -f ".next/dev/lock" ]]; then
  rm -f ".next/dev/lock" >/dev/null 2>&1 || true
fi

echo "[dev] Iniciando frontend (dev)..."
npm run dev
