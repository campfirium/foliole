#!/usr/bin/env bash

resolve_quality_gate_log_mode() {
  printf '%s' "${QUALITY_GATE_LOG_MODE:-fail-only}"
}

quality_gate_should_print_step() {
  [[ "$(resolve_quality_gate_log_mode)" != "fail-only" ]]
}

resolve_quality_gate_heartbeat_seconds() {
  local heartbeat_seconds="${QUALITY_GATE_HEARTBEAT_SECONDS:-${DEFAULT_QUALITY_GATE_HEARTBEAT_SECONDS}}"
  if [[ ! "${heartbeat_seconds}" =~ ^[0-9]+$ || "${heartbeat_seconds}" -le 0 ]]; then
    heartbeat_seconds="${DEFAULT_QUALITY_GATE_HEARTBEAT_SECONDS}"
  fi
  printf '%s' "${heartbeat_seconds}"
}

resolve_quality_gate_excerpt_lines() {
  local value="$1"
  local fallback="$2"
  if [[ ! "${value}" =~ ^[0-9]+$ || "${value}" -lt 0 ]]; then
    printf '%s' "${fallback}"
    return 0
  fi
  printf '%s' "${value}"
}

resolve_quality_gate_log_retention_runs() {
  local retention_runs="${QUALITY_GATE_LOG_RETENTION_RUNS:-${DEFAULT_QUALITY_GATE_LOG_RETENTION_RUNS}}"
  if [[ ! "${retention_runs}" =~ ^[0-9]+$ ]]; then
    retention_runs="${DEFAULT_QUALITY_GATE_LOG_RETENTION_RUNS}"
  fi
  printf '%s' "${retention_runs}"
}

sanitize_quality_gate_log_name() {
  local value="$1"
  value="${value//:/_}"
  value="${value// /-}"
  value="${value//\//_}"
  printf '%s' "${value}"
}

resolve_quality_gate_log_root() {
  local root_dir="${QUALITY_GATE_LOG_ROOT:-.tmp/logs/quality-gate}"
  mkdir -p "${root_dir}"
  (
    cd "${root_dir}" >/dev/null 2>&1
    pwd -P
  )
}

ensure_quality_gate_run_dir() {
  if [[ -n "${QUALITY_GATE_RUN_DIR:-}" ]]; then
    return 0
  fi
  local log_root run_id
  log_root="$(resolve_quality_gate_log_root)"
  run_id="${QUALITY_GATE_RUN_ID:-$(date +%Y%m%d-%H%M%S)-$$}"
  QUALITY_GATE_RUN_DIR="${log_root}/${run_id}"
  mkdir -p "${QUALITY_GATE_RUN_DIR}"
  prune_quality_gate_logs "${log_root}" "${run_id}"
}

prune_quality_gate_logs() {
  local log_root="$1"
  local active_run_id="$2"
  local retention_runs run_ids stale_run

  retention_runs="$(resolve_quality_gate_log_retention_runs)"
  if (( retention_runs <= 0 )); then
    return 0
  fi

  mapfile -t run_ids < <(
    find "${log_root}" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | sort -r
  )

  local kept_runs=0
  for stale_run in "${run_ids[@]}"; do
    [[ -z "${stale_run}" ]] && continue
    if [[ "${stale_run}" == "${active_run_id}" ]]; then
      kept_runs=$((kept_runs + 1))
      continue
    fi
    if (( kept_runs < retention_runs )); then
      kept_runs=$((kept_runs + 1))
      continue
    fi
    rm -rf "${log_root}/${stale_run}"
  done
}

create_quality_gate_log_file() {
  local script_name="$1"
  local run_dir file_name
  ensure_quality_gate_run_dir
  run_dir="${QUALITY_GATE_RUN_DIR}"
  file_name="$(sanitize_quality_gate_log_name "${script_name}").log"
  printf '%s/%s' "${run_dir}" "${file_name}"
}

create_quality_gate_failed_file() {
  ensure_quality_gate_run_dir
  printf '%s/failed.txt' "${QUALITY_GATE_RUN_DIR}"
}

print_quality_gate_success_excerpt() {
  local prefix="$1"
  local display_name="$2"
  local output_file="$3"
  local total_lines tail_lines

  total_lines="$(wc -l <"${output_file}" | tr -d ' ')"
  if (( total_lines == 0 )); then
    return 0
  fi

  tail_lines="$(resolve_quality_gate_excerpt_lines "${QUALITY_GATE_SUCCESS_TAIL_LINES:-${DEFAULT_QUALITY_GATE_SUCCESS_TAIL_LINES}}" "${DEFAULT_QUALITY_GATE_SUCCESS_TAIL_LINES}")"
  if (( total_lines <= tail_lines )); then
    cat "${output_file}"
    return 0
  fi

  echo "[${prefix}] showing last ${tail_lines} lines for ${display_name} (${total_lines} total lines)"
  tail -n "${tail_lines}" "${output_file}"
}

print_quality_gate_failure_excerpt() {
  local prefix="$1"
  local display_name="$2"
  local output_file="$3"
  local total_lines head_lines tail_lines

  total_lines="$(wc -l <"${output_file}" | tr -d ' ')"
  head_lines="$(resolve_quality_gate_excerpt_lines "${QUALITY_GATE_FAILURE_HEAD_LINES:-${DEFAULT_QUALITY_GATE_FAILURE_HEAD_LINES}}" "${DEFAULT_QUALITY_GATE_FAILURE_HEAD_LINES}")"
  tail_lines="$(resolve_quality_gate_excerpt_lines "${QUALITY_GATE_FAILURE_TAIL_LINES:-${DEFAULT_QUALITY_GATE_FAILURE_TAIL_LINES}}" "${DEFAULT_QUALITY_GATE_FAILURE_TAIL_LINES}")"

  if (( total_lines <= head_lines + tail_lines + 1 )); then
    cat "${output_file}"
    return 0
  fi

  echo "[${prefix}] showing first ${head_lines} and last ${tail_lines} lines for ${display_name} (${total_lines} total lines)"
  sed -n "1,${head_lines}p" "${output_file}"
  echo "[${prefix}] ... output trimmed ..."
  tail -n "${tail_lines}" "${output_file}"
}
