#!/usr/bin/env bash

terminate_process_group() {
  local pgid="$1"

  if [[ -z "${pgid}" ]]; then
    return 0
  fi

  kill -TERM -- "-${pgid}" 2>/dev/null || true
  sleep 1
  kill -KILL -- "-${pgid}" 2>/dev/null || true
}

terminate_quality_gate_child() {
  local pid="$1"
  local pgid="$2"

  if [[ -n "${pgid}" ]]; then
    terminate_process_group "${pgid}"
    return 0
  fi

  if [[ -n "${pid}" ]]; then
    kill -TERM "${pid}" 2>/dev/null || true
    sleep 1
    kill -KILL "${pid}" 2>/dev/null || true
  fi
}

sum_process_group_rss_kb() {
  local pgid="$1"

  if [[ -z "${pgid}" ]]; then
    printf '0'
    return 0
  fi

  ps -o rss= -g "${pgid}" 2>/dev/null | awk '{sum += $1} END {printf "%d", sum + 0}'
}

sum_process_rss_kb() {
  local pid="$1"

  if [[ -z "${pid}" ]]; then
    printf '0'
    return 0
  fi

  ps -o rss= -p "${pid}" 2>/dev/null | awk '{sum += $1} END {printf "%d", sum + 0}'
}

sum_guarded_command_rss_kb() {
  local pid="$1"
  local pgid="$2"

  if [[ -n "${pgid}" ]]; then
    sum_process_group_rss_kb "${pgid}"
    return 0
  fi

  sum_process_rss_kb "${pid}"
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

  local child_pgid=""
  if command -v setsid >/dev/null 2>&1; then
    setsid "$@" >"${output_file}" 2>&1 &
    child_pgid="$!"
  else
    "$@" >"${output_file}" 2>&1 &
  fi
  local child_pid=$!
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
      wait "${child_pid}" 2>/dev/null || true
      return 1
    fi

    if (( timeout_seconds > 0 && elapsed >= timeout_seconds )); then
      echo "[${prefix}] failed: ${command_label} exceeded timeout (${timeout_seconds}s)"
      echo "[${prefix}] stalled after: ${elapsed}s"
      echo "[${prefix}] peak ${command_label} memory: ${peak_rss_kb} KiB"
      terminate_quality_gate_child "${child_pid}" "${child_pgid}"
      QUALITY_GATE_ACTIVE_PGID=""
      QUALITY_GATE_LAST_PEAK_RSS_KB="${peak_rss_kb}"
      wait "${child_pid}" 2>/dev/null || true
      return 1
    fi

    sleep 0.2
  done

  local exit_code=0
  if wait "${child_pid}"; then
    exit_code=0
  else
    exit_code=$?
  fi

  if [[ "${exit_code}" -ne 0 ]]; then
    echo "[${prefix}] peak ${command_label} memory: ${peak_rss_kb} KiB"
  fi

  QUALITY_GATE_ACTIVE_PGID=""
  QUALITY_GATE_LAST_PEAK_RSS_KB="${peak_rss_kb}"

  return "${exit_code}"
}
