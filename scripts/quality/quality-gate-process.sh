#!/usr/bin/env bash

QUALITY_GATE_PROCESS_DIR="${QUALITY_GATE_LIB_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
source "${QUALITY_GATE_PROCESS_DIR}/quality-gate-process-tree.sh"

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
  report_process_tracking_capability "${prefix}"

  local child_pgid="" child_pid_file="${output_file}.pid" child_status_file="${output_file}.exit"
  local wrapper_script="${QUALITY_GATE_PROCESS_DIR}/quality-gate-command-wrapper.sh"
  rm -f "${child_pid_file}" "${child_status_file}"
  if command -v setsid >/dev/null 2>&1; then
    setsid bash "${wrapper_script}" "${output_file}" "${child_pid_file}" "${child_status_file}" "$@" &
  else
    bash "${wrapper_script}" "${output_file}" "${child_pid_file}" "${child_status_file}" "$@" &
  fi
  local wrapper_pid=$!
  local child_pid="${wrapper_pid}"
  local pid_probe
  for _ in {1..20}; do
    if [[ -s "${child_pid_file}" ]]; then
      pid_probe="$(cat "${child_pid_file}" 2>/dev/null || true)"
      if [[ "${pid_probe}" =~ ^[0-9]+$ ]]; then
        child_pid="${pid_probe}"
        break
      fi
    fi
    if ! kill -0 "${wrapper_pid}" 2>/dev/null; then
      break
    fi
    sleep 0.05
  done
  local child_pgid_unsafe=0
  child_pgid="$(resolve_process_group_id "${child_pid}")"
  if [[ "${child_pgid}" == "$(resolve_process_group_id "$$")" ]]; then
    child_pgid=""
    child_pgid_unsafe=1
  fi
  if [[ "${child_pgid_unsafe}" -eq 0 && -z "${child_pgid}" ]] && command -v setsid >/dev/null 2>&1; then
    child_pgid="${child_pid}"
  fi
  QUALITY_GATE_ACTIVE_PGID="${child_pgid}"
  local started_at heartbeat_seconds
  started_at="$(date +%s)"
  heartbeat_seconds="$(resolve_quality_gate_heartbeat_seconds)"
  local peak_rss_kb=0
  QUALITY_GATE_LAST_PEAK_RSS_KB=0

  while kill -0 "${child_pid}" 2>/dev/null; do
    local now elapsed current_rss_kb
    now="$(date +%s)"
    elapsed=$((now - started_at))
    current_rss_kb="$(sum_guarded_command_rss_kb "${child_pid}" "${child_pgid}")"

    if (( current_rss_kb > peak_rss_kb )); then
      peak_rss_kb="${current_rss_kb}"
    fi

    if (( elapsed > 0 && elapsed % heartbeat_seconds == 0 )); then
      echo "[${prefix}] waiting: ${command_label} still running (${elapsed}s elapsed, peak ${command_label} memory ${peak_rss_kb} KiB)"
    fi

    if (( max_rss_kb > 0 && current_rss_kb > max_rss_kb )); then
      echo "[${prefix}] failed: ${command_label} exceeded memory limit (${current_rss_kb} KiB > ${max_rss_kb} KiB)"
      echo "[${prefix}] stalled after: ${elapsed}s"
      echo "[${prefix}] peak ${command_label} memory: ${peak_rss_kb} KiB"
      terminate_quality_gate_child "${child_pid}" "${child_pgid}"
      QUALITY_GATE_ACTIVE_PGID=""
      QUALITY_GATE_LAST_PEAK_RSS_KB="${peak_rss_kb}"
      wait "${wrapper_pid}" 2>/dev/null || true
      return 1
    fi

    if (( timeout_seconds > 0 && elapsed >= timeout_seconds )); then
      echo "[${prefix}] failed: ${command_label} exceeded timeout (${timeout_seconds}s)"
      echo "[${prefix}] stalled after: ${elapsed}s"
      echo "[${prefix}] peak ${command_label} memory: ${peak_rss_kb} KiB"
      terminate_quality_gate_child "${child_pid}" "${child_pgid}"
      QUALITY_GATE_ACTIVE_PGID=""
      QUALITY_GATE_LAST_PEAK_RSS_KB="${peak_rss_kb}"
      wait "${wrapper_pid}" 2>/dev/null || true
      return 1
    fi

    sleep 0.2
  done

  local exit_code=0
  if wait "${wrapper_pid}"; then
    exit_code=0
  else
    exit_code=$?
    if [[ "${exit_code}" -eq 127 && -f "${child_status_file}" ]]; then
      exit_code="$(cat "${child_status_file}" 2>/dev/null || printf '127')"
    fi
  fi

  if [[ "${exit_code}" -ne 0 ]]; then
    echo "[${prefix}] peak ${command_label} memory: ${peak_rss_kb} KiB"
  fi

  QUALITY_GATE_ACTIVE_PGID=""
  QUALITY_GATE_LAST_PEAK_RSS_KB="${peak_rss_kb}"

  return "${exit_code}"
}
