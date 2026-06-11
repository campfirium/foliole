#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WINDOWS_SYNC_SCRIPT="${WINDOWS_SYNC_SCRIPT:-scripts/windows/windows-sync.sh}"
WINDOWS_CLIENT_SCRIPT="${WINDOWS_CLIENT_SCRIPT:-scripts/windows/windows-restart-client.sh}"
WINDOWS_RESTART_INTENT_SCRIPT="${WINDOWS_RESTART_INTENT_SCRIPT:-scripts/windows/write-restart-intent.mjs}"
WINDOWS_RENDERER_RELOAD_INTENT_SCRIPT="${WINDOWS_RENDERER_RELOAD_INTENT_SCRIPT:-scripts/windows/write-renderer-reload-intent.mjs}"
WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT="${WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT:-scripts/windows/check-electron-dist-fresh.mjs}"
WINDOWS_ELECTRON_DIST_SYNC_SCRIPT="${WINDOWS_ELECTRON_DIST_SYNC_SCRIPT:-scripts/windows/electron-dist-incremental-sync.mjs}"
WINDOWS_STARTUP_DIAGNOSTICS_SCRIPT="${WINDOWS_STARTUP_DIAGNOSTICS_SCRIPT:-scripts/windows/print-startup-failure-diagnostics.mjs}"
WINDOWS_ELECTRON_COMPILE_COMMAND="${WINDOWS_ELECTRON_COMPILE_COMMAND:-npm run electron:compile}"
WINDOWS_NODE_MODULES_CHECK_COMMAND="${WINDOWS_NODE_MODULES_CHECK_COMMAND:-}"
WINDOWS_NATIVE_ABI_CHECK_COMMAND="${WINDOWS_NATIVE_ABI_CHECK_COMMAND:-}"
WINDOWS_NATIVE_ABI_REPAIR_COMMAND="${WINDOWS_NATIVE_ABI_REPAIR_COMMAND:-}"
WINDOWS_NATIVE_ABI_PREFLIGHT_SCRIPT="${WINDOWS_NATIVE_ABI_PREFLIGHT_SCRIPT:-scripts/windows/native-abi-preflight.ps1}"
WINDOWS_NATIVE_ABI_REPAIR_SCRIPT="${WINDOWS_NATIVE_ABI_REPAIR_SCRIPT:-scripts/windows/electron-native-abi-repair.ps1}"
WINDOWS_RESTART_INTENT_ROOT="${WINDOWS_RESTART_INTENT_ROOT:-}"
WINDOWS_RENDERER_RELOAD_INTENT_ROOT="${WINDOWS_RENDERER_RELOAD_INTENT_ROOT:-}"
WINDOWS_PREVIEW_SYNC_STAMP_FILE="${WINDOWS_PREVIEW_SYNC_STAMP_FILE:-.lab/internal/runtime/windows-sync.stamp}"
WINDOWS_WORKDIR="${WINDOWS_WORKDIR:-D:\\C\\foliole}"
WINDOWS_PREVIEW_TIMEOUT_SECONDS="${WINDOWS_PREVIEW_TIMEOUT_SECONDS:-25}"
WINDOWS_PREVIEW_TIMEOUT_STATUS_SECONDS="${WINDOWS_PREVIEW_TIMEOUT_STATUS_SECONDS:-${WINDOWS_PREVIEW_TIMEOUT_SECONDS}}"
WINDOWS_PREVIEW_TIMEOUT_START_SECONDS="${WINDOWS_PREVIEW_TIMEOUT_START_SECONDS:-60}"
WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS="${WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS:-60}"
DEV_RESTART_DELIVERY_FILE=".windows-dev-restart-delivered.json"
DEV_RENDERER_RELOAD_DELIVERY_FILE=".windows-dev-renderer-reload-delivered.json"
BOOT_READY_FILE=".windows-native-boot-ready.json"
BRIDGE_READY_FILE=".windows-native-bridge-ready.json"
WINDOW_VISIBLE_FILE=".windows-native-window-visible.json"

cd "${REPO_ROOT}"

source "${SCRIPT_DIR}/windows-preview-common.sh"
source "${SCRIPT_DIR}/windows-preview-client.sh"
source "${SCRIPT_DIR}/windows-preview-preflight.sh"
source "${SCRIPT_DIR}/windows-preview-mtime-changes.sh"
source "${SCRIPT_DIR}/windows-preview-change-selection.sh"
source "${SCRIPT_DIR}/windows-preview-intent-paths.sh"
source "${SCRIPT_DIR}/windows-preview-waits.sh"
source "${SCRIPT_DIR}/windows-preview-actions.sh"

CURRENT_HEAD="$(resolve_current_head)"

echo "[windows-preview] step 1/4: verify electron-dist freshness"
ensure_fresh_electron_dist

echo "[windows-preview] step 2/4: sync to windows mirror"
changed_files="$(resolve_changed_files)"
if has_runtime_code_changes "${changed_files}"; then
  set +e
  WINDOWS_PREVIEW_CHANGED_FILES="${changed_files}" node "${WINDOWS_ELECTRON_DIST_SYNC_SCRIPT}"
  electron_dist_sync_exit=$?
  set -e
  if [ "${electron_dist_sync_exit}" -eq 0 ]; then
    WINDOWS_SYNC_CHANGED_FILES="${changed_files}" WINDOWS_SYNC_STAMP_FILE="${WINDOWS_PREVIEW_SYNC_STAMP_FILE}" bash "${WINDOWS_SYNC_SCRIPT}"
  else
    WINDOWS_SYNC_FORCE_FULL=1 WINDOWS_SYNC_INCLUDE_ELECTRON_DIST=1 WINDOWS_SYNC_STAMP_FILE="${WINDOWS_PREVIEW_SYNC_STAMP_FILE}" bash "${WINDOWS_SYNC_SCRIPT}"
  fi
else
  WINDOWS_SYNC_CHANGED_FILES="${changed_files}" WINDOWS_SYNC_STAMP_FILE="${WINDOWS_PREVIEW_SYNC_STAMP_FILE}" bash "${WINDOWS_SYNC_SCRIPT}"
fi

echo "[windows-preview] step 3/4: verify windows node_modules"
run_windows_native_preflight_if_needed

select_update_action "${changed_files}"

echo "[windows-preview] step 4/4: apply update action"
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
