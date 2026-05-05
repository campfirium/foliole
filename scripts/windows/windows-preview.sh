#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WINDOWS_SYNC_SCRIPT="${WINDOWS_SYNC_SCRIPT:-scripts/windows/windows-sync.sh}"
WINDOWS_CLIENT_SCRIPT="${WINDOWS_CLIENT_SCRIPT:-scripts/windows/windows-restart-client.sh}"
WINDOWS_RESTART_INTENT_SCRIPT="${WINDOWS_RESTART_INTENT_SCRIPT:-scripts/windows/write-restart-intent.mjs}"
WINDOWS_RESTART_INTENT_ROOT="${WINDOWS_RESTART_INTENT_ROOT:-}"
WINDOWS_WORKDIR="${WINDOWS_WORKDIR:-C:\\dev\\foliole}"
WINDOWS_PREVIEW_TIMEOUT_SECONDS="${WINDOWS_PREVIEW_TIMEOUT_SECONDS:-25}"
WINDOWS_PREVIEW_TIMEOUT_STATUS_SECONDS="${WINDOWS_PREVIEW_TIMEOUT_STATUS_SECONDS:-${WINDOWS_PREVIEW_TIMEOUT_SECONDS}}"
WINDOWS_PREVIEW_TIMEOUT_START_SECONDS="${WINDOWS_PREVIEW_TIMEOUT_START_SECONDS:-180}"
WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS="${WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS:-180}"

cd "${REPO_ROOT}"

resolve_current_head() {
  if [ -n "${WINDOWS_PREVIEW_CURRENT_HEAD:-}" ]; then
    printf '%s' "${WINDOWS_PREVIEW_CURRENT_HEAD}"
    return 0
  fi
  git rev-parse HEAD 2>/dev/null || true
}

extract_runtime_head() {
  printf '%s\n' "$1" | sed -n 's/.* head=\([^[:space:]]*\).*/\1/p' | head -n 1
}

has_committed_electron_changes_since() {
  local runtime_head="$1"
  if [ -n "${WINDOWS_PREVIEW_COMMITTED_ELECTRON_CHANGES:-}" ]; then
    [ -n "${WINDOWS_PREVIEW_COMMITTED_ELECTRON_CHANGES}" ]
    return
  fi
  if [ -z "${runtime_head}" ] || [ -z "${CURRENT_HEAD}" ]; then
    return 1
  fi
  if [ "${runtime_head}" = "${CURRENT_HEAD}" ]; then
    return 1
  fi
  if ! git rev-parse --verify "${runtime_head}^{commit}" >/dev/null 2>&1; then
    return 0
  fi
  git diff --name-only "${runtime_head}..${CURRENT_HEAD}" -- electron/ | grep -q .
}

CURRENT_HEAD="$(resolve_current_head)"

run_windows_client_action() {
  local action="$1"
  local timeout_seconds="${WINDOWS_PREVIEW_TIMEOUT_SECONDS}"
  local output_file=""
  local action_pid=0
  local elapsed_seconds=0
  local exit_code=0
  if [ "${action}" = "status" ]; then
    timeout_seconds="${WINDOWS_PREVIEW_TIMEOUT_STATUS_SECONDS}"
  fi
  if [ "${action}" = "start" ]; then
    timeout_seconds="${WINDOWS_PREVIEW_TIMEOUT_START_SECONDS}"
  fi
  if [ "${action}" = "restart" ]; then
    timeout_seconds="${WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS}"
  fi

  output_file="$(mktemp)"
  WINDOWS_CLIENT_ACTION="${action}" bash "${WINDOWS_CLIENT_SCRIPT}" >"${output_file}" 2>&1 &
  action_pid=$!
  while kill -0 "${action_pid}" 2>/dev/null; do
    local current_output=""
    current_output="$(cat "${output_file}")"
    if [ "${action}" = "restart" ] && echo "${current_output}" | grep -qE 'status:\s*RESTARTED'; then
      kill "${action_pid}" 2>/dev/null || true
      sleep 1
      kill -9 "${action_pid}" 2>/dev/null || true
      printf '%s' "${current_output}"
      rm -f "${output_file}"
      return 0
    fi
    if [ "${action}" = "start" ] && echo "${current_output}" | grep -qE 'status:\s*(RUNNING|STARTED)'; then
      kill "${action_pid}" 2>/dev/null || true
      sleep 1
      kill -9 "${action_pid}" 2>/dev/null || true
      printf '%s' "${current_output}"
      rm -f "${output_file}"
      return 0
    fi
    if [ "${action}" = "status" ] && echo "${current_output}" | grep -qE 'status:\s*(RUNNING|STOPPED)'; then
      kill "${action_pid}" 2>/dev/null || true
      sleep 1
      kill -9 "${action_pid}" 2>/dev/null || true
      printf '%s' "${current_output}"
      rm -f "${output_file}"
      return 0
    fi
    if echo "${current_output}" | grep -qE 'status:\s*(RESTART_FAILED|START_FAILED)'; then
      kill "${action_pid}" 2>/dev/null || true
      sleep 1
      kill -9 "${action_pid}" 2>/dev/null || true
      printf '%s' "${current_output}"
      rm -f "${output_file}"
      return 1
    fi
    if [ "${elapsed_seconds}" -ge "${timeout_seconds}" ]; then
      kill "${action_pid}" 2>/dev/null || true
      sleep 1
      kill -9 "${action_pid}" 2>/dev/null || true
      printf '%s' "$(cat "${output_file}")"
      rm -f "${output_file}"
      return 124
    fi
    sleep 1
    elapsed_seconds=$((elapsed_seconds + 1))
  done

  set +e
  wait "${action_pid}"
  exit_code=$?
  set -e
  printf '%s' "$(cat "${output_file}")"
  rm -f "${output_file}"
  return "${exit_code}"
}

resolve_changed_files() {
  if [ -n "${WINDOWS_PREVIEW_CHANGED_FILES:-}" ]; then
    printf '%s' "${WINDOWS_PREVIEW_CHANGED_FILES}"
    return 0
  fi
  {
    git diff --name-only
    git diff --name-only --cached
    git ls-files --others --exclude-standard
  } | sort -u
}

status_is_running() {
  echo "$1" | grep -qE 'status:\s*RUNNING'
}

status_is_stopped() {
  echo "$1" | grep -qE 'status:\s*STOPPED'
}

select_update_action() {
  local changed_files="$1"
  local status_output=""
  local status_exit=0
  local runtime_head=""

  set +e
  status_output="$(run_windows_client_action status)"
  status_exit=$?
  set -e

  if [ "${status_exit}" -eq 0 ] && status_is_running "${status_output}"; then
    runtime_head="$(extract_runtime_head "${status_output}")"
    if echo "${changed_files}" | grep -qE '^electron/'; then
      SELECTED_ACTION="restart-intent"
      SELECTED_REASON="Class B: working tree electron changes detected"
      return 0
    fi
    if has_committed_electron_changes_since "${runtime_head}"; then
      SELECTED_ACTION="restart-intent"
      SELECTED_REASON="Class B: runtime behind committed electron changes"
      return 0
    fi
    SELECTED_ACTION="sync-only"
    SELECTED_REASON="Class A: renderer-only sync path"
    return 0
  fi

  if [ "${status_exit}" -eq 0 ] && status_is_stopped "${status_output}"; then
    SELECTED_ACTION="fallback-start"
    SELECTED_REASON="Class C: no trusted running client"
    return 0
  fi

  if [ "${status_exit}" -eq 124 ]; then
    SELECTED_ACTION="fallback-start"
    SELECTED_REASON="Class C: status probe timed out"
    return 0
  fi

  SELECTED_ACTION="fallback-start"
  SELECTED_REASON="Class C: client status unavailable"
}

run_sync_only() {
  echo "[windows-preview] selected action: sync-only"
  echo "[windows-preview] status: SYNCED"
}

resolve_restart_intent_root() {
  if [ -n "${WINDOWS_RESTART_INTENT_ROOT}" ]; then
    printf '%s' "${WINDOWS_RESTART_INTENT_ROOT}"
    return 0
  fi
  if command -v wslpath >/dev/null 2>&1; then
    wslpath -u "${WINDOWS_WORKDIR}"
    return 0
  fi
  printf '%s' "${REPO_ROOT}"
}

run_restart_intent() {
  local restart_output=""
  local restart_exit=0
  local restart_intent_root=""
  echo "[windows-preview] selected action: restart-intent"
  restart_intent_root="$(resolve_restart_intent_root)"
  set +e
  restart_output="$(
    FOLIOLE_RESTART_INTENT_HEAD="${CURRENT_HEAD}" \
      FOLIOLE_RESTART_INTENT_REASON="${SELECTED_REASON}" \
      FOLIOLE_RESTART_INTENT_REQUESTED_BY="wsl-windows-preview" \
      FOLIOLE_RESTART_INTENT_ROOT="${restart_intent_root}" \
      node "${WINDOWS_RESTART_INTENT_SCRIPT}"
  )"
  restart_exit=$?
  set -e
  if [ "${restart_exit}" -eq 0 ] && echo "${restart_output}" | grep -qE 'status:\s*REQUESTED'; then
    echo "${restart_output}"
    echo "[windows-preview] status: RESTART_REQUESTED"
    return 0
  fi
  echo "[windows-preview] restart intent failed"
  if [ -n "${restart_output}" ]; then
    echo "${restart_output}"
  fi
  return 1
}

run_fallback_start() {
  local start_output=""
  local start_exit=0
  echo "[windows-preview] selected action: fallback-start"
  set +e
  start_output="$(run_windows_client_action start)"
  start_exit=$?
  set -e
  if [ "${start_exit}" -eq 0 ] && echo "${start_output}" | grep -qE 'status:\s*(RUNNING|STARTED)'; then
    echo "[windows-preview] status: STARTED"
    return 0
  fi
  echo "[windows-preview] fallback start failed"
  if [ -n "${start_output}" ]; then
    echo "${start_output}"
  fi
  return 1
}

echo "[windows-preview] step 1/2: sync to windows mirror"
bash "${WINDOWS_SYNC_SCRIPT}"

changed_files="$(resolve_changed_files)"
select_update_action "${changed_files}"

echo "[windows-preview] step 2/2: apply update action"
echo "[windows-preview] reason: ${SELECTED_REASON}"

case "${SELECTED_ACTION}" in
  sync-only)
    run_sync_only
    ;;
  restart-intent)
    run_restart_intent
    ;;
  fallback-start)
    run_fallback_start
    ;;
  *)
    echo "[windows-preview] unknown selected action: ${SELECTED_ACTION}"
    exit 1
    ;;
esac
