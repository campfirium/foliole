#!/usr/bin/env bash
set -euo pipefail

resolve_package_manager() {
  local resolved_pm="npm"
  if [[ -f "pnpm-lock.yaml" ]]; then
    resolved_pm="pnpm"
  elif [[ -f "bun.lockb" || -f "bun.lock" ]]; then
    resolved_pm="bun"
  elif [[ -f "yarn.lock" ]]; then
    resolved_pm="yarn"
  fi
  printf '%s' "${resolved_pm}"
}

has_package_script() {
  local script_name="$1"
  node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts['$script_name'] ? 0 : 1)"
}

quality_gate_should_print_step() {
  [[ "${QUALITY_GATE_LOG_MODE:-verbose}" != "fail-only" ]]
}

terminate_process_group() {
  local pgid="$1"

  if [[ -z "${pgid}" ]]; then
    return 0
  fi

  kill -TERM -- "-${pgid}" 2>/dev/null || true
  sleep 1
  kill -KILL -- "-${pgid}" 2>/dev/null || true
}

sum_process_group_rss_kb() {
  local pgid="$1"

  if [[ -z "${pgid}" ]]; then
    printf '0'
    return 0
  fi

  ps -o rss= -g "${pgid}" 2>/dev/null | awk '{sum += $1} END {printf "%d", sum + 0}'
}

run_command_with_limits() {
  local prefix="$1"
  local output_file="$2"
  local timeout_seconds="$3"
  local max_rss_kb="$4"
  local command_label="$5"
  shift 5

  if [[ "$#" -eq 0 ]]; then
    echo "[${prefix}] missing guarded command"
    return 1
  fi

  setsid "$@" >"${output_file}" 2>&1 &
  local child_pid=$!
  local child_pgid="${child_pid}"
  QUALITY_GATE_ACTIVE_PGID="${child_pgid}"
  local started_at
  started_at="$(date +%s)"
  local peak_rss_kb=0

  while kill -0 "${child_pid}" 2>/dev/null; do
    local now elapsed current_rss_kb
    now="$(date +%s)"
    elapsed=$((now - started_at))
    current_rss_kb="$(sum_process_group_rss_kb "${child_pgid}")"

    if (( current_rss_kb > peak_rss_kb )); then
      peak_rss_kb="${current_rss_kb}"
    fi

    if (( max_rss_kb > 0 && current_rss_kb > max_rss_kb )); then
      echo "[${prefix}] failed: ${command_label} exceeded memory limit (${current_rss_kb} KiB > ${max_rss_kb} KiB)"
      echo "[${prefix}] peak ${command_label} memory: ${peak_rss_kb} KiB"
      terminate_process_group "${child_pgid}"
      QUALITY_GATE_ACTIVE_PGID=""
      wait "${child_pid}" 2>/dev/null || true
      return 1
    fi

    if (( timeout_seconds > 0 && elapsed >= timeout_seconds )); then
      echo "[${prefix}] failed: ${command_label} exceeded timeout (${timeout_seconds}s)"
      echo "[${prefix}] peak ${command_label} memory: ${peak_rss_kb} KiB"
      terminate_process_group "${child_pgid}"
      QUALITY_GATE_ACTIVE_PGID=""
      wait "${child_pid}" 2>/dev/null || true
      return 1
    fi

    sleep 1
  done

  local exit_code=0
  set +e
  wait "${child_pid}"
  exit_code=$?
  set -e

  if [[ "${exit_code}" -ne 0 ]]; then
    echo "[${prefix}] peak ${command_label} memory: ${peak_rss_kb} KiB"
  fi

  QUALITY_GATE_ACTIVE_PGID=""

  return "${exit_code}"
}

resolve_quality_gate_limit() {
  local script_name="$1"
  local metric="$2"
  local normalized env_name fallback

  normalized="$(printf '%s' "${script_name}" | tr '[:lower:]-' '[:upper:]_')"
  case "${metric}" in
    timeout_seconds)
      env_name="QUALITY_GATE_${normalized}_TIMEOUT_SECONDS"
      fallback="${QUALITY_GATE_TIMEOUT_SECONDS:-600}"
      ;;
    max_rss_kb)
      env_name="QUALITY_GATE_${normalized}_MAX_RSS_KB"
      fallback="${QUALITY_GATE_MAX_RSS_KB:-1048576}"
      ;;
    *)
      echo "unknown quality gate limit: ${metric}" >&2
      return 1
      ;;
  esac

  printf '%s' "${!env_name:-${fallback}}"
}

run_quality_gate_command() {
  local prefix="$1"
  local script_name="$2"
  local display_name="$3"
  shift 3

  local mode="${QUALITY_GATE_LOG_MODE:-verbose}"
  local timeout_seconds max_rss_kb output_file exit_code
  timeout_seconds="$(resolve_quality_gate_limit "${script_name}" timeout_seconds)"
  max_rss_kb="$(resolve_quality_gate_limit "${script_name}" max_rss_kb)"
  output_file="$(mktemp)"

  if quality_gate_should_print_step; then
    echo "[${prefix}] running: ${display_name}"
    echo "[${prefix}] limits for ${display_name}: timeout=${timeout_seconds}s, max-rss=${max_rss_kb}KiB"
  fi

  set +e
  run_command_with_limits "${prefix}" "${output_file}" "${timeout_seconds}" "${max_rss_kb}" "${display_name}" "$@"
  exit_code=$?
  set -e

  if [[ "${exit_code}" -ne 0 ]]; then
    echo "[${prefix}] failed: ${display_name}"
    cat "${output_file}"
    rm -f "${output_file}"
    return "${exit_code}"
  fi

  if [[ "${mode}" == "verbose" ]]; then
    cat "${output_file}"
  fi

  if quality_gate_should_print_step; then
    echo "[${prefix}] passed: ${display_name}"
  fi

  rm -f "${output_file}"
}

run_quality_gate_script() {
  local prefix="$1"
  local pm="$2"
  local script_name="$3"

  if ! has_package_script "${script_name}"; then
    echo "[${prefix}] missing script: ${script_name}"
    exit 1
  fi

  local mode="${QUALITY_GATE_LOG_MODE:-verbose}"
  if [[ "${mode}" != "verbose" && "${mode}" != "summary" && "${mode}" != "fail-only" ]]; then
    echo "[${prefix}] invalid QUALITY_GATE_LOG_MODE: ${mode}"
    exit 1
  fi

  local -a command_args=()
  if [[ "${pm}" == "yarn" ]]; then
    command_args=(yarn "${script_name}")
  else
    command_args=("${pm}" run "${script_name}")
  fi

  run_quality_gate_command "${prefix}" "${script_name}" "${script_name}" "${command_args[@]}"
}
