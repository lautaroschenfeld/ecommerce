#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Este script es solo para macOS."
  exit 1
fi

SELF_PID="$$"
declare -a NORMALIZED_PORTS=()

add_port() {
  local raw="$1"
  if [[ -z "${raw}" ]]; then
    return 0
  fi

  if [[ ! "${raw}" =~ ^[0-9]+$ ]]; then
    echo "[dev] Puerto invalido: '${raw}'."
    exit 1
  fi

  if (( raw < 1 || raw > 65535 )); then
    echo "[dev] Puerto fuera de rango: '${raw}'."
    exit 1
  fi

  local existing
  for existing in "${NORMALIZED_PORTS[@]:-}"; do
    if [[ "${existing}" == "${raw}" ]]; then
      return 0
    fi
  done

  NORMALIZED_PORTS+=("${raw}")
}

for entry in "$@"; do
  [[ -z "${entry}" ]] && continue
  IFS=',; ' read -r -a TOKENS <<<"${entry}"
  for token in "${TOKENS[@]}"; do
    add_port "${token}"
  done
done

if [[ ${#NORMALIZED_PORTS[@]} -eq 0 ]]; then
  echo "[dev] No se recibieron puertos validos para liberar."
  exit 1
fi

docker_daemon_ready() {
  if ! command -v docker >/dev/null 2>&1; then
    return 1
  fi
  docker info >/dev/null 2>&1
}

list_pids_on_port() {
  local port="$1"
  lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null | sort -u || true
}

process_name() {
  local pid="$1"
  ps -p "${pid}" -o comm= 2>/dev/null | sed 's#^.*/##' || true
}

stop_docker_containers_using_port() {
  local port="$1"
  local line container_id container_name stopped=0

  if ! docker_daemon_ready; then
    return 0
  fi

  while IFS=$'\t' read -r container_id container_name; do
    [[ -z "${container_id}" ]] && continue
    [[ -z "${container_name}" ]] && container_name="${container_id}"
    echo "[dev] Deteniendo contenedor Docker '${container_name}' que usa :${port}..."
    if docker stop "${container_id}" >/dev/null 2>&1; then
      stopped=$((stopped + 1))
    fi
  done < <(docker ps --filter "publish=${port}" --format '{{.ID}}\t{{.Names}}' 2>/dev/null || true)

  return 0
}

is_docker_process_name() {
  local name="$1"
  case "${name}" in
    com.docker.backend|docker|docker-proxy|vpnkit|wslrelay)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

kill_pid() {
  local pid="$1"
  local name="$2"
  [[ "${pid}" == "${SELF_PID}" ]] && return 0

  echo "[dev] Cerrando proceso ${name} (PID ${pid})..."
  kill -TERM "${pid}" >/dev/null 2>&1 || true
  sleep 0.2
  if kill -0 "${pid}" >/dev/null 2>&1; then
    kill -KILL "${pid}" >/dev/null 2>&1 || true
  fi
}

declare -a FAILED_PORTS=()

for port in "${NORMALIZED_PORTS[@]}"; do
  echo "[dev] Verificando puerto ${port}..."

  for attempt in 1 2 3 4; do
    pids=($(list_pids_on_port "${port}"))
    [[ ${#pids[@]} -eq 0 ]] && break

    local_has_docker=0
    for pid in "${pids[@]}"; do
      name="$(process_name "${pid}")"
      if is_docker_process_name "${name}"; then
        local_has_docker=1
      fi
    done

    if [[ "${local_has_docker}" == "1" ]]; then
      stop_docker_containers_using_port "${port}"
      sleep 0.4
      pids=($(list_pids_on_port "${port}"))
      [[ ${#pids[@]} -eq 0 ]] && break
    fi

    for pid in "${pids[@]}"; do
      name="$(process_name "${pid}")"
      [[ -z "${name}" ]] && name="desconocido"
      kill_pid "${pid}" "${name}"
    done

    sleep 0.3
  done

  remaining=($(list_pids_on_port "${port}"))
  if [[ ${#remaining[@]} -eq 0 ]]; then
    echo "[dev] Puerto ${port} liberado."
    continue
  fi

  echo "[dev] No se pudo liberar el puerto ${port} automaticamente."
  FAILED_PORTS+=("${port}")
done

if [[ ${#FAILED_PORTS[@]} -gt 0 ]]; then
  echo "[dev] Puertos aun ocupados: $(printf '%s, ' "${FAILED_PORTS[@]}" | sed 's/, $//')"
  exit 1
fi

exit 0
