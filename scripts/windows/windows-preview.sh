#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WINDOWS_SYNC_SCRIPT="${WINDOWS_SYNC_SCRIPT:-scripts/windows/windows-sync.sh}"
WINDOWS_CLIENT_SCRIPT="${WINDOWS_CLIENT_SCRIPT:-scripts/windows/windows-restart-client.sh}"
WINDOWS_RESTART_INTENT_SCRIPT="${WINDOWS_RESTART_INTENT_SCRIPT:-scripts/windows/write-restart-intent.mjs}"
WINDOWS_RENDERER_RELOAD_INTENT_SCRIPT="${WINDOWS_RENDERER_RELOAD_INTENT_SCRIPT:-scripts/windows/write-renderer-reload-intent.mjs}"
WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT="${WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT:-scripts/windows/check-electron-dist-fresh.mjs}"
WINDOWS_ELECTRON_COMPILE_COMMAND="${WINDOWS_ELECTRON_COMPILE_COMMAND:-npm run electron:compile}"
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

extract_status_reason() {
  printf '%s\n' "$1" | sed -n 's/.* reason=\([^[:space:]]*\).*/\1/p' | head -n 1
}

extract_status_detail() {
  printf '%s\n' "$1" | sed -n 's/^\[windows-restart-client\] //p' | tail -n 1
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
  local committed_files=""
  committed_files="$(git diff --name-only "${runtime_head}..${CURRENT_HEAD}" -- electron/ lib/core/ lib/platform/)"
  if [ -z "${committed_files}" ]; then
    return 1
  fi
  while IFS= read -r file; do
    if is_runtime_file "${file}"; then
      return 0
    fi
  done <<< "${committed_files}"
  return 1
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
    if [ "${action}" = "start" ] && echo "${current_output}" | grep -qE 'status:\s*STARTED'; then
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

is_runtime_file() {
  local file="$1"
  # Must be under a runtime directory
  if ! echo "${file}" | grep -qE '^(electron/|lib/core/|lib/platform/)'; then
    return 1
  fi
  # Exclude test files, config files, and non-runtime artifacts
  if echo "${file}" | grep -qE '\.(test|spec)\.(ts|tsx|mjs|js)$'; then
    return 1
  fi
  if echo "${file}" | grep -qE '(tsconfig\.json|\.eslintrc|\.prettierrc)$'; then
    return 1
  fi
  return 0
}

has_runtime_code_changes() {
  local changed_files="$1"
  while IFS= read -r file; do
    if is_runtime_file "${file}"; then
      return 0
    fi
  done <<< "${changed_files}"
  return 1
}

ensure_fresh_electron_dist() {
  local freshness_output=""
  local freshness_exit=0
  set +e
  freshness_output="$(node "${WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT}" 2>&1)"
  freshness_exit=$?
  set -e
  if [ "${freshness_exit}" -eq 0 ]; then
    printf '%s\n' "${freshness_output}"
    return 0
  fi

  printf '%s\n' "${freshness_output}"
  echo "[windows-preview] electron-dist stale; compiling runtime bundle"
  eval "${WINDOWS_ELECTRON_COMPILE_COMMAND}"
  node "${WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT}"
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
  local status_reason=""

  SELECTED_STATUS_DETAIL=""

  set +e
  status_output="$(run_windows_client_action status)"
  status_exit=$?
  set -e

  if [ "${status_exit}" -eq 0 ] && status_is_running "${status_output}"; then
    SELECTED_STATUS_DETAIL="$(extract_status_detail "${status_output}")"
    runtime_head="$(extract_runtime_head "${status_output}")"
    if has_runtime_code_changes "${changed_files}"; then
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
    SELECTED_STATUS_DETAIL="$(extract_status_detail "${status_output}")"
    status_reason="$(extract_status_reason "${status_output}")"
    SELECTED_ACTION="fallback-start"
    if [ -n "${status_reason}" ]; then
      SELECTED_REASON="Class C: no trusted running client (${status_reason})"
    else
      SELECTED_REASON="Class C: no trusted running client"
    fi
    return 0
  fi

  if [ "${status_exit}" -eq 124 ]; then
    SELECTED_ACTION="status-probe-failed"
    SELECTED_REASON="Class C: status probe timed out"
    return 0
  fi

  SELECTED_ACTION="status-probe-failed"
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
  if [ "${start_exit}" -eq 0 ] && echo "${start_output}" | grep -qE 'status:\s*STARTED'; then
    echo "[windows-preview] status: STARTED"
    return 0
  fi
  echo "[windows-preview] fallback start failed"
  if [ -n "${start_output}" ]; then
    echo "${start_output}"
  fi
  return 1
}

run_status_probe_failed() {
  echo "[windows-preview] selected action: status-probe-failed"
  echo "[windows-preview] status probe failed"
  return 1
}

echo "[windows-preview] step 1/3: verify electron-dist freshness"
ensure_fresh_electron_dist

echo "[windows-preview] step 2/3: sync to windows mirror"
changed_files="$(resolve_changed_files)"
if has_runtime_code_changes "${changed_files}"; then
  WINDOWS_SYNC_INCLUDE_ELECTRON_DIST=1 bash "${WINDOWS_SYNC_SCRIPT}"
else
  bash "${WINDOWS_SYNC_SCRIPT}"
fi

select_update_action "${changed_files}"

echo "[windows-preview] step 3/3: apply update action"
echo "[windows-preview] reason: ${SELECTED_REASON}"
if [ -n "${SELECTED_STATUS_DETAIL:-}" ]; then
  echo "[windows-preview] client status detail: ${SELECTED_STATUS_DETAIL}"
fi

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
  status-probe-failed)
    run_status_probe_failed
    ;;
  *)
    echo "[windows-preview] unknown selected action: ${SELECTED_ACTION}"
    exit 1
    ;;
esac
