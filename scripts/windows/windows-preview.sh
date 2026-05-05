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
WINDOWS_RENDERER_RELOAD_INTENT_ROOT="${WINDOWS_RENDERER_RELOAD_INTENT_ROOT:-}"
WINDOWS_WORKDIR="${WINDOWS_WORKDIR:-C:\\dev\\foliole}"
WINDOWS_PREVIEW_TIMEOUT_SECONDS="${WINDOWS_PREVIEW_TIMEOUT_SECONDS:-25}"
WINDOWS_PREVIEW_TIMEOUT_STATUS_SECONDS="${WINDOWS_PREVIEW_TIMEOUT_STATUS_SECONDS:-${WINDOWS_PREVIEW_TIMEOUT_SECONDS}}"
WINDOWS_PREVIEW_TIMEOUT_START_SECONDS="${WINDOWS_PREVIEW_TIMEOUT_START_SECONDS:-180}"
WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS="${WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS:-180}"
DEV_RESTART_DELIVERY_FILE=".windows-dev-restart-delivered.json"
DEV_RENDERER_RELOAD_DELIVERY_FILE=".windows-dev-renderer-reload-delivered.json"
BOOT_READY_FILE=".windows-native-boot-ready.json"
BRIDGE_READY_FILE=".windows-native-bridge-ready.json"

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

extract_runtime_pid() {
  printf '%s\n' "$1" | sed -n 's/.* runtime_pid=\([0-9][0-9]*\).*/\1/p' | head -n 1
}

extract_intent_nonce() {
  printf '%s\n' "$1" | sed -n 's/.* nonce=\([^[:space:]]*\).*/\1/p' | head -n 1
}

read_json_field() {
  local file_path="$1"
  local field_name="$2"
  if [ ! -f "${file_path}" ]; then
    return 1
  fi
  node -e '
const fs = require("node:fs");
const filePath = process.argv[1];
const fieldName = process.argv[2];
const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
const value = payload?.[fieldName];
if (value === undefined || value === null || value === "") {
  process.exit(1);
}
process.stdout.write(String(value));
' "${file_path}" "${field_name}"
}

iso_now() {
  node -e 'process.stdout.write(new Date().toISOString())'
}

iso_timestamp_gte() {
  local left="$1"
  local right="$2"
  [ "${left}" = "${right}" ] || [[ "${left}" > "${right}" ]]
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

is_shell_config_file() {
  local file="$1"
  # Vite-time config captured at electron-dev.mjs boot. A renderer reload or
  # runtime-only Electron restart keeps the same Vite process, so these need a
  # full shell restart to re-run npm run electron:dev from scratch.
  if echo "${file}" | grep -qE '^(tailwind\.config\.(js|cjs|mjs|ts)|postcss\.config\.(js|cjs|mjs|ts)|vite\.config\.(js|cjs|mjs|ts)|package\.json|package-lock\.json)$'; then
    return 0
  fi
  return 1
}

has_shell_config_changes() {
  local changed_files="$1"
  while IFS= read -r file; do
    if is_shell_config_file "${file}"; then
      return 0
    fi
  done <<< "${changed_files}"
  return 1
}

has_committed_shell_config_changes_since() {
  local runtime_head="$1"
  if [ -n "${WINDOWS_PREVIEW_COMMITTED_SHELL_CONFIG_CHANGES:-}" ]; then
    [ -n "${WINDOWS_PREVIEW_COMMITTED_SHELL_CONFIG_CHANGES}" ]
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
  committed_files="$(git diff --name-only "${runtime_head}..${CURRENT_HEAD}")"
  if [ -z "${committed_files}" ]; then
    return 1
  fi
  while IFS= read -r file; do
    if is_shell_config_file "${file}"; then
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
  if [ "${action}" = "restart" ] || [ "${action}" = "full-restart" ]; then
    timeout_seconds="${WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS}"
  fi

  output_file="$(mktemp)"
  WINDOWS_CLIENT_ACTION="${action}" bash "${WINDOWS_CLIENT_SCRIPT}" >"${output_file}" 2>&1 &
  action_pid=$!
  while kill -0 "${action_pid}" 2>/dev/null; do
    local current_output=""
    local status_probe_output=""
    current_output="$(cat "${output_file}")"
    if { [ "${action}" = "restart" ] || [ "${action}" = "full-restart" ]; } && echo "${current_output}" | grep -qE 'status:\s*RESTARTED'; then
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
    if [ "${action}" = "start" ] &&
      status_probe_output="$(probe_running_status_detail)"; then
      kill "${action_pid}" 2>/dev/null || true
      sleep 1
      kill -9 "${action_pid}" 2>/dev/null || true
      if [ -n "${current_output}" ]; then
        printf '%s\n%s' "${current_output}" "${status_probe_output}"
      else
        printf '%s' "${status_probe_output}"
      fi
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

is_renderer_source_file() {
  local file="$1"
  if ! echo "${file}" | grep -qE '^(src/app/|src/features/|src/shared/|src/store/)'; then
    return 1
  fi
  if echo "${file}" | grep -qE '\.(test|spec)\.(ts|tsx|mjs|js)$'; then
    return 1
  fi
  return 0
}

has_renderer_source_changes() {
  local changed_files="$1"
  while IFS= read -r file; do
    if is_renderer_source_file "${file}"; then
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

status_is_running_trusted() {
  echo "$1" | grep -qE 'status:\s*RUNNING\b' && echo "$1" | grep -qE 'trust=OK'
}

status_is_started_or_running_trusted() {
  echo "$1" | grep -qE 'status:\s*STARTED' || status_is_running_trusted "$1"
}

probe_running_status_detail() {
  local status_output=""
  local status_exit=0
  set +e
  status_output="$(run_windows_client_action status)"
  status_exit=$?
  set -e
  if [ "${status_exit}" -eq 0 ] && status_is_running_trusted "${status_output}"; then
    printf '%s' "${status_output}"
    return 0
  fi
  return 1
}

select_update_action() {
  local changed_files="$1"
  local status_output=""
  local status_exit=0
  local runtime_head=""
  local status_reason=""

  SELECTED_STATUS_DETAIL=""
  SELECTED_RUNTIME_PID=""

  set +e
  status_output="$(run_windows_client_action status)"
  status_exit=$?
  set -e

  if [ "${status_exit}" -eq 0 ] && status_is_running "${status_output}"; then
    SELECTED_STATUS_DETAIL="$(extract_status_detail "${status_output}")"
    SELECTED_RUNTIME_PID="$(extract_runtime_pid "${status_output}")"
    runtime_head="$(extract_runtime_head "${status_output}")"
    if has_shell_config_changes "${changed_files}"; then
      SELECTED_ACTION="full-restart"
      SELECTED_REASON="Class D: working tree shell/vite config changes detected"
      return 0
    fi
    if has_committed_shell_config_changes_since "${runtime_head}"; then
      SELECTED_ACTION="full-restart"
      SELECTED_REASON="Class D: runtime behind committed shell/vite config changes"
      return 0
    fi
    if has_runtime_code_changes "${changed_files}"; then
      if has_renderer_source_changes "${changed_files}"; then
        SELECTED_ACTION="full-restart"
        SELECTED_REASON="Class D: working tree runtime and renderer changes require shell restart"
        return 0
      fi
      SELECTED_ACTION="restart-intent"
      SELECTED_REASON="Class B: working tree electron changes detected"
      return 0
    fi
    if has_committed_electron_changes_since "${runtime_head}"; then
      if has_renderer_source_changes "${changed_files}"; then
        SELECTED_ACTION="full-restart"
        SELECTED_REASON="Class D: runtime behind committed electron changes with renderer changes"
        return 0
      fi
      SELECTED_ACTION="restart-intent"
      SELECTED_REASON="Class B: runtime behind committed electron changes"
      return 0
    fi
    SELECTED_ACTION="renderer-reload-intent"
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

resolve_renderer_reload_intent_root() {
  if [ -n "${WINDOWS_RENDERER_RELOAD_INTENT_ROOT}" ]; then
    printf '%s' "${WINDOWS_RENDERER_RELOAD_INTENT_ROOT}"
    return 0
  fi
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

resolve_renderer_reload_delivery_path() {
  printf '%s/%s' "$(resolve_renderer_reload_intent_root)" "${DEV_RENDERER_RELOAD_DELIVERY_FILE}"
}

resolve_renderer_reload_intent_path() {
  printf '%s/%s' "$(resolve_renderer_reload_intent_root)" ".windows-dev-renderer-reload-intent.json"
}

resolve_restart_delivery_path() {
  printf '%s/%s' "$(resolve_restart_intent_root)" "${DEV_RESTART_DELIVERY_FILE}"
}

resolve_boot_ready_path() {
  printf '%s/%s' "$(resolve_restart_intent_root)" "${BOOT_READY_FILE}"
}

resolve_bridge_ready_path() {
  printf '%s/%s' "$(resolve_restart_intent_root)" "${BRIDGE_READY_FILE}"
}

wait_for_delivery_nonce() {
  local delivery_path="$1"
  local expected_nonce="$2"
  local timeout_seconds="$3"
  local label="$4"
  local elapsed_seconds=0

  while [ "${elapsed_seconds}" -lt "${timeout_seconds}" ]; do
    local delivered_nonce=""
    set +e
    delivered_nonce="$(read_json_field "${delivery_path}" nonce 2>/dev/null)"
    local read_exit=$?
    set -e
    if [ "${read_exit}" -eq 0 ] && [ "${delivered_nonce}" = "${expected_nonce}" ]; then
      echo "[windows-preview] ${label} delivery acknowledged nonce=${expected_nonce}"
      return 0
    fi
    sleep 1
    elapsed_seconds=$((elapsed_seconds + 1))
  done

  echo "[windows-preview] ${label} delivery timed out nonce=${expected_nonce}"
  return 1
}

cancel_pending_renderer_reload_intent() {
  local intent_path=""
  intent_path="$(resolve_renderer_reload_intent_path)"
  if [ -f "${intent_path}" ]; then
    rm -f "${intent_path}"
    echo "[windows-preview] canceled pending renderer reload intent path=${intent_path}"
  fi
}

wait_for_running_status() {
  local timeout_seconds="$1"
  local status_label="$2"
  local elapsed_seconds=0

  while [ "${elapsed_seconds}" -lt "${timeout_seconds}" ]; do
    local status_output=""
    local status_exit=0
    set +e
    status_output="$(run_windows_client_action status)"
    status_exit=$?
    set -e
    if [ "${status_exit}" -eq 0 ] && status_is_running "${status_output}"; then
      echo "[windows-preview] ${status_label}: $(extract_status_detail "${status_output}")"
      return 0
    fi
    sleep 1
    elapsed_seconds=$((elapsed_seconds + 1))
  done

  echo "[windows-preview] ${status_label} timed out"
  return 1
}

restart_ready_can_use_existing_markers() {
  local requested_at="$1"
  local previous_runtime_pid="${2:-}"
  local boot_ready_path=""
  local bridge_ready_path=""
  local boot_timestamp=""
  local bridge_timestamp=""
  local status_output=""
  local status_exit=0
  local current_runtime_pid=""
  local runtime_head=""

  boot_ready_path="$(resolve_boot_ready_path)"
  bridge_ready_path="$(resolve_bridge_ready_path)"
  set +e
  boot_timestamp="$(read_json_field "${boot_ready_path}" timestamp 2>/dev/null)"
  local boot_exit=$?
  bridge_timestamp="$(read_json_field "${bridge_ready_path}" timestamp 2>/dev/null)"
  local bridge_exit=$?
  status_output="$(run_windows_client_action status)"
  status_exit=$?
  set -e

  if [ "${boot_exit}" -ne 0 ] || [ "${bridge_exit}" -ne 0 ]; then
    return 1
  fi
  if [ "${status_exit}" -ne 0 ] || ! status_is_running_trusted "${status_output}"; then
    return 1
  fi

  current_runtime_pid="$(extract_runtime_pid "${status_output}")"
  runtime_head="$(extract_runtime_head "${status_output}")"

  if [ -n "${previous_runtime_pid}" ] && [ -n "${current_runtime_pid}" ] && [ "${current_runtime_pid}" != "${previous_runtime_pid}" ]; then
    echo "[windows-preview] restart markers accepted via trusted running status runtime_pid=${current_runtime_pid} boot=${boot_timestamp} bridge=${bridge_timestamp}"
    return 0
  fi

  if [ -n "${CURRENT_HEAD}" ] && [ -n "${runtime_head}" ] && [ "${runtime_head}" = "${CURRENT_HEAD}" ]; then
    echo "[windows-preview] restart markers accepted via trusted running current head=${runtime_head} boot=${boot_timestamp} bridge=${bridge_timestamp}"
    return 0
  fi

  return 1
}

wait_for_restart_ready_markers() {
  local requested_at="$1"
  local timeout_seconds="$2"
  local previous_runtime_pid="${3:-}"
  local boot_ready_path
  local bridge_ready_path
  local elapsed_seconds=0

  boot_ready_path="$(resolve_boot_ready_path)"
  bridge_ready_path="$(resolve_bridge_ready_path)"

  while [ "${elapsed_seconds}" -lt "${timeout_seconds}" ]; do
    local boot_timestamp=""
    local bridge_timestamp=""
    set +e
    boot_timestamp="$(read_json_field "${boot_ready_path}" timestamp 2>/dev/null)"
    local boot_exit=$?
    bridge_timestamp="$(read_json_field "${bridge_ready_path}" timestamp 2>/dev/null)"
    local bridge_exit=$?
    set -e
    if [ "${boot_exit}" -eq 0 ] && [ "${bridge_exit}" -eq 0 ] &&
      iso_timestamp_gte "${boot_timestamp}" "${requested_at}" &&
      iso_timestamp_gte "${bridge_timestamp}" "${requested_at}"; then
      echo "[windows-preview] restart markers updated boot=${boot_timestamp} bridge=${bridge_timestamp}"
      return 0
    fi
    if restart_ready_can_use_existing_markers "${requested_at}" "${previous_runtime_pid}"; then
      return 0
    fi
    sleep 1
    elapsed_seconds=$((elapsed_seconds + 1))
  done

  echo "[windows-preview] restart markers timed out requested_at=${requested_at}"
  return 1
}

run_renderer_reload_intent() {
  local reload_output=""
  local reload_exit=0
  local reload_intent_root=""
  local reload_nonce=""
  echo "[windows-preview] selected action: renderer-reload-intent"
  reload_intent_root="$(resolve_renderer_reload_intent_root)"
  set +e
  reload_output="$(
    FOLIOLE_RENDERER_RELOAD_INTENT_HEAD="${CURRENT_HEAD}" \
      FOLIOLE_RENDERER_RELOAD_INTENT_REASON="${SELECTED_REASON}" \
      FOLIOLE_RENDERER_RELOAD_INTENT_REQUESTED_BY="wsl-windows-preview" \
      FOLIOLE_RENDERER_RELOAD_INTENT_ROOT="${reload_intent_root}" \
      node "${WINDOWS_RENDERER_RELOAD_INTENT_SCRIPT}"
  )"
  reload_exit=$?
  set -e
  if [ "${reload_exit}" -eq 0 ] && echo "${reload_output}" | grep -qE 'status:\s*REQUESTED'; then
    echo "${reload_output}"
    reload_nonce="$(extract_intent_nonce "${reload_output}")"
    if [ -z "${reload_nonce}" ]; then
      echo "[windows-preview] renderer reload intent missing nonce"
      return 1
    fi
    if ! wait_for_delivery_nonce "$(resolve_renderer_reload_delivery_path)" "${reload_nonce}" "${WINDOWS_PREVIEW_TIMEOUT_SECONDS}" "renderer reload"; then
      echo "[windows-preview] renderer reload delivery missing; falling back to restart-intent"
      cancel_pending_renderer_reload_intent
      run_restart_intent
      return $?
    fi
    echo "[windows-preview] status: SYNCED"
    return 0
  fi
  echo "[windows-preview] renderer reload intent failed"
  if [ -n "${reload_output}" ]; then
    echo "${reload_output}"
  fi
  return 1
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
  local restart_nonce=""
  local requested_at=""
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
    restart_nonce="$(extract_intent_nonce "${restart_output}")"
    if [ -z "${restart_nonce}" ]; then
      echo "[windows-preview] restart intent missing nonce"
      return 1
    fi
    if ! wait_for_delivery_nonce "$(resolve_restart_delivery_path)" "${restart_nonce}" "${WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS}" "restart"; then
      echo "[windows-preview] restart delivery missing after intent request; falling back to direct restart"
      run_direct_restart
      return $?
    fi
    requested_at="$(read_json_field "$(resolve_restart_delivery_path)" requestedAt 2>/dev/null || true)"
    if [ -z "${requested_at}" ]; then
      echo "[windows-preview] restart delivery missing requestedAt nonce=${restart_nonce}"
      return 1
    fi
    if ! wait_for_restart_ready_markers "${requested_at}" "${WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS}" "${SELECTED_RUNTIME_PID:-}"; then
      echo "[windows-preview] restart markers missing after intent delivery; falling back to direct restart"
      run_direct_restart
      return $?
    fi
    if ! wait_for_running_status "${WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS}" "restart status"; then
      echo "[windows-preview] restart status check failed after intent delivery; falling back to direct restart"
      run_direct_restart
      return $?
    fi
    echo "[windows-preview] status: STARTED"
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
  if [ "${start_exit}" -eq 0 ] && status_is_started_or_running_trusted "${start_output}"; then
    echo "[windows-preview] status: STARTED"
    return 0
  fi
  echo "[windows-preview] fallback start failed"
  if [ -n "${start_output}" ]; then
    echo "${start_output}"
  fi
  return 1
}

run_full_restart() {
  local output=""
  local exit_code=0
  echo "[windows-preview] selected action: full-restart"
  set +e
  output="$(run_windows_client_action full-restart)"
  exit_code=$?
  set -e
  if [ "${exit_code}" -eq 0 ] && echo "${output}" | grep -qE 'status:\s*RESTARTED'; then
    echo "${output}"
    echo "[windows-preview] status: STARTED"
    return 0
  fi
  echo "[windows-preview] full restart failed"
  if [ -n "${output}" ]; then
    echo "${output}"
  fi
  return 1
}

run_direct_restart() {
  local restart_output=""
  local restart_exit=0
  local requested_at=""
  requested_at="$(iso_now)"
  echo "[windows-preview] selected action: direct-restart"
  set +e
  restart_output="$(run_windows_client_action restart)"
  restart_exit=$?
  set -e
  if [ "${restart_exit}" -eq 0 ] && echo "${restart_output}" | grep -qE 'status:\s*RESTARTED'; then
    echo "${restart_output}"
    echo "[windows-preview] status: STARTED"
    return 0
  fi
  echo "[windows-preview] direct restart failed"
  if [ -n "${restart_output}" ]; then
    echo "${restart_output}"
  fi
  if wait_for_restart_ready_markers "${requested_at}" "${WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS}" &&
    wait_for_running_status "${WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS}" "direct restart status"; then
    echo "[windows-preview] direct restart recovered via fresh startup markers"
    echo "[windows-preview] status: STARTED"
    return 0
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
  renderer-reload-intent)
    run_renderer_reload_intent
    ;;
  restart-intent)
    run_restart_intent
    ;;
  full-restart)
    run_full_restart
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
