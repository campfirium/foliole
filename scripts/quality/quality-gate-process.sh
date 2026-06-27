#!/usr/bin/env bash

terminate_process_group() {
  local pgid="$1"
  local pid

  if [[ -z "${pgid}" ]]; then
    return 0
  fi

  kill -TERM -- "-${pgid}" 2>/dev/null || true
  for pid in $(list_process_group_pids "${pgid}"); do
    [[ "${pid}" == "$$" ]] || kill -TERM "${pid}" 2>/dev/null || true
  done
  sleep 1
  kill -KILL -- "-${pgid}" 2>/dev/null || true
  for pid in $(list_process_group_pids "${pgid}"); do
    [[ "${pid}" == "$$" ]] || kill -KILL "${pid}" 2>/dev/null || true
  done
}

quality_gate_has_ps() { command -v ps >/dev/null 2>&1; }

report_process_tracking_capability() {
  local prefix="$1"
  if [[ "${QUALITY_GATE_PROCESS_CAPABILITY_REPORTED:-0}" == "1" ]]; then
    return 0
  fi
  QUALITY_GATE_PROCESS_CAPABILITY_REPORTED=1
  if quality_gate_has_ps; then
    echo "[${prefix}] process tracking: ps available"
    return 0
  fi
  if [[ -d /proc ]]; then
    echo "[${prefix}] process tracking: ps unavailable; using /proc fallbacks where possible"
    return 0
  fi
  echo "[${prefix}] process tracking: ps and /proc unavailable; tracking direct child only"
}

terminate_quality_gate_child() {
  local pid="$1"
  local pgid="$2"

  if [[ -n "${pgid}" ]]; then
    terminate_process_group "${pgid}"
    return 0
  fi

  if [[ -n "${pid}" ]]; then
    terminate_process_tree "${pid}"
    kill -TERM "${pid}" 2>/dev/null || true
    sleep 1
    terminate_process_tree "${pid}" KILL
    kill -KILL "${pid}" 2>/dev/null || true
  fi
}

sum_process_group_rss_kb() {
  local pgid="$1"
  local pid sum=0

  if [[ -z "${pgid}" ]]; then
    printf '0'
    return 0
  fi
  if ps -o rss= -g "${pgid}" >/dev/null 2>&1; then
    ps -o rss= -g "${pgid}" 2>/dev/null | awk '{sum += $1} END {printf "%d", sum + 0}'
    return 0
  fi
  for pid in $(list_process_group_pids "${pgid}"); do
    sum=$((sum + $(read_process_rss_kb "${pid}")))
  done
  printf '%d' "${sum}"
}

sum_process_rss_kb() {
  local pid="$1"

  if [[ -z "${pid}" ]]; then
    printf '0'
    return 0
  fi
  if ps -o rss= -p "${pid}" >/dev/null 2>&1; then
    ps -o rss= -p "${pid}" 2>/dev/null | awk '{sum += $1} END {printf "%d", sum + 0}'
    return 0
  fi
  read_process_rss_kb "${pid}"
}

list_process_group_pids() {
  local pgid="$1"
  quality_gate_has_ps || return 0
  ps 2>/dev/null | awk -v pgid="${pgid}" 'NR > 1 && $3 == pgid {print $1}'
}

list_process_tree_pids() {
  local root_pid="$1" frontier="${root_pid}"
  local next pid

  while [[ -n "${frontier}" ]]; do
    next=""
    for pid in ${frontier}; do
      quality_gate_has_ps || continue
      ps 2>/dev/null | awk -v ppid="${pid}" 'NR > 1 && $2 == ppid {print $1}'
    done | while read -r pid; do
      [[ -n "${pid}" ]] || continue
      printf '%s\n' "${pid}"
      next="${next} ${pid}"
    done
    frontier="${next}"
  done
}

terminate_process_tree() {
  local root_pid="$1"
  local signal="${2:-TERM}"
  local pid

  for pid in $(list_process_tree_pids "${root_pid}"); do
    [[ "${pid}" == "$$" ]] || kill "-${signal}" "${pid}" 2>/dev/null || true
  done
}

read_process_rss_kb() {
  local pid="$1" status_file="/proc/${pid}/status"

  if [[ ! -r "${status_file}" ]]; then
    printf '0'
    return 0
  fi

  awk '/^VmRSS:/ {print $2; found=1; exit} END {if (!found) print 0}' "${status_file}" 2>/dev/null || printf '0'
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

resolve_process_group_id() {
  local pid="$1"

  if [[ -z "${pid}" ]]; then
    printf ''
    return 0
  fi
  quality_gate_has_ps || {
    printf ''
    return 0
  }
  if ps -o pgid= -p "${pid}" >/dev/null 2>&1; then
    ps -o pgid= -p "${pid}" 2>/dev/null | awk 'NR == 1 {gsub(/^[ \t]+|[ \t]+$/, "", $0); print; exit}'
    return 0
  fi

  ps 2>/dev/null | awk -v pid="${pid}" 'NR > 1 && $1 == pid {print $3; exit}'
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
  report_process_tracking_capability "${prefix}"

  local child_pgid=""
  if command -v setsid >/dev/null 2>&1; then
    setsid "$@" >"${output_file}" 2>&1 &
  else
    "$@" >"${output_file}" 2>&1 &
  fi
  local child_pid=$!
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
