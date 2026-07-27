#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
source "${SCRIPT_DIR}/android-windows-workdir.sh"
ANDROID_SOURCE_SYNC_SCRIPT="${ANDROID_SOURCE_SYNC_SCRIPT:-scripts/android/windows-source-sync.sh}"
ANDROID_SYNC_SCRIPT="${ANDROID_SYNC_SCRIPT:-scripts/android/windows-cap-sync.sh}"
ANDROID_OPEN_SCRIPT="${ANDROID_OPEN_SCRIPT:-scripts/android/windows-open.sh}"
ANDROID_EMULATOR_SCRIPT="${ANDROID_EMULATOR_SCRIPT:-scripts/android/windows-run-emulator.sh}"
ANDROID_DEPLOY_SCRIPT="${ANDROID_DEPLOY_SCRIPT:-scripts/android/windows-deploy-app.sh}"
ANDROID_DATA_PROTECTION_SCRIPT="${ANDROID_DATA_PROTECTION_SCRIPT:-scripts/android/android-device-data-protection.mjs}"
ANDROID_SYNC_STATE_SCRIPT="${ANDROID_SYNC_STATE_SCRIPT:-scripts/android/android-preview-sync-state.mjs}"
ELECTRON_SQLITE_RUNNER="${ELECTRON_SQLITE_RUNNER:-scripts/electron-sqlite-runner.mjs}"
ANDROID_DATA_PROTECTION_NODE="${ANDROID_DATA_PROTECTION_NODE:-node}"
ANDROID_DATA_PROTECTION_BACKUP_DIR="${ANDROID_DATA_PROTECTION_BACKUP_DIR:-.lab/internal/android-device-backups}"
ANDROID_DATA_PROTECTION_MANIFEST_DIR="${ANDROID_DATA_PROTECTION_MANIFEST_DIR:-.lab/internal/runtime}"
ANDROID_DATA_PROTECTION_RUNTIME_ROOT="${ANDROID_DATA_PROTECTION_RUNTIME_ROOT:-${REPO_ROOT}}"
ANDROID_DATA_PROTECTION="${ANDROID_DATA_PROTECTION:-0}"
ANDROID_ELECTRON_ABI_PREPARE="${ANDROID_ELECTRON_ABI_PREPARE:-0}"
ANDROID_NATIVE_ABI_REPAIR_SCRIPT="${ANDROID_NATIVE_ABI_REPAIR_SCRIPT:-scripts/windows/windows-native-abi-repair.mjs}"
ANDROID_PREVIEW_OPEN_STUDIO="${ANDROID_PREVIEW_OPEN_STUDIO:-1}"
DEFAULT_ANDROID_AVD="${DEFAULT_ANDROID_AVD:-Foliole_API_36}"
ANDROID_PREVIEW_AVD="${ANDROID_PREVIEW_AVD-${FOLIOLE_ANDROID_AVD-${DEFAULT_ANDROID_AVD}}}"
ANDROID_PREVIEW_TARGET_SERIAL="${FOLIOLE_ANDROID_SERIAL:-${ANDROID_SERIAL:-}}"
ANDROID_PREVIEW_SYNC_TIMEOUT_SECONDS="${ANDROID_PREVIEW_SYNC_TIMEOUT_SECONDS:-600}"
ANDROID_PREVIEW_CAP_SYNC_TIMEOUT_SECONDS="${ANDROID_PREVIEW_CAP_SYNC_TIMEOUT_SECONDS:-600}"
ANDROID_PREVIEW_EMULATOR_TIMEOUT_SECONDS="${ANDROID_PREVIEW_EMULATOR_TIMEOUT_SECONDS:-240}"
ANDROID_PREVIEW_DEPLOY_TIMEOUT_SECONDS="${ANDROID_PREVIEW_DEPLOY_TIMEOUT_SECONDS:-600}"
ANDROID_PREVIEW_DATA_PROTECTION_TIMEOUT_SECONDS="${ANDROID_PREVIEW_DATA_PROTECTION_TIMEOUT_SECONDS:-120}"
ANDROID_PREVIEW_NATIVE_ABI_TIMEOUT_SECONDS="${ANDROID_PREVIEW_NATIVE_ABI_TIMEOUT_SECONDS:-600}"
ANDROID_PREVIEW_OPEN_STUDIO_TIMEOUT_SECONDS="${ANDROID_PREVIEW_OPEN_STUDIO_TIMEOUT_SECONDS:-60}"
ANDROID_PREVIEW_SYNC_STATE_TIMEOUT_SECONDS="${ANDROID_PREVIEW_SYNC_STATE_TIMEOUT_SECONDS:-30}"
ANDROID_PREVIEW_KILL_AFTER_SECONDS="${ANDROID_PREVIEW_KILL_AFTER_SECONDS:-10}"
ANDROID_PREVIEW_SYNC_STATE_CHECK="${ANDROID_PREVIEW_SYNC_STATE_CHECK:-1}"
ANDROID_PREVIEW_TIMINGS=""
PREVIEW_TOTAL_STEPS=3

if [[ -n "${FOLIOLE_DEV_APP_LANGUAGE:-}" && -z "${VITE_FOLIOLE_DEV_APP_LANGUAGE:-}" ]]; then
  export VITE_FOLIOLE_DEV_APP_LANGUAGE="${FOLIOLE_DEV_APP_LANGUAGE}"
fi
if [[ -n "${VITE_FOLIOLE_DEV_APP_LANGUAGE:-}" ]]; then
  export VITE_FOLIOLE_INTERNAL_BUILD=1
fi

if [[ -n "${ANDROID_PREVIEW_TARGET_SERIAL}" ]]; then
  ANDROID_PREVIEW_AVD=""
fi

if [[ -n "${ANDROID_PREVIEW_TARGET_SERIAL}" || -n "${ANDROID_PREVIEW_AVD}" ]]; then
  PREVIEW_TOTAL_STEPS=4
  if [[ "${ANDROID_DATA_PROTECTION}" != "0" ]]; then
    PREVIEW_TOTAL_STEPS=5
    if [[ -n "${ANDROID_PREVIEW_AVD}" ]]; then
      PREVIEW_TOTAL_STEPS=6
    fi
  fi
fi

cd "${REPO_ROOT}"

run_preview_step() {
  local label="$1"
  shift

  local started_at finished_at elapsed exit_code
  started_at="$(date +%s)"
  echo "[android-preview] begin: ${label}"
  set +e
  "$@"
  exit_code=$?
  set -e
  finished_at="$(date +%s)"
  elapsed=$((finished_at - started_at))
  echo "[android-preview] done: ${label} (${elapsed}s)"
  ANDROID_PREVIEW_TIMINGS="${ANDROID_PREVIEW_TIMINGS}${label}=${elapsed}s "
  return "${exit_code}"
}

run_with_timeout() {
  local timeout_seconds="$1"
  shift
  local timeout_command="${ANDROID_PREVIEW_TIMEOUT_COMMAND:-timeout}"

  if command -v "${timeout_command}" >/dev/null 2>&1; then
    "${timeout_command}" --kill-after="${ANDROID_PREVIEW_KILL_AFTER_SECONDS}" "${timeout_seconds}" "$@"
    return $?
  fi

  node "${REPO_ROOT}/scripts/run-with-timeout.mjs" "${timeout_seconds}" "$@"
}

run_timed_preview_step() {
  local label="$1"
  local timeout_seconds="$2"
  shift 2

  echo "[android-preview] ${label} timeout: ${timeout_seconds}s"
  run_preview_step "${label}" run_with_timeout "${timeout_seconds}" "$@"
}

normalize_host_path() {
  android_windows_path_to_shell_path "$1"
}

ensure_host_dir() {
  local host_dir
  host_dir="$(normalize_host_path "$1")"
  if ! mkdir -p "${host_dir}" 2>/dev/null; then
    echo "[android-preview] warning: host dir precreate skipped: ${host_dir}" >&2
  fi
}

run_runtime_timed_step() {
  local label="$1"
  local timeout_seconds="$2"
  shift 2
  run_timed_preview_step "${label}" "${timeout_seconds}" \
    bash -c 'cd "$1" && shift && exec "$@"' foliole-android-runtime "${ANDROID_DATA_PROTECTION_RUNTIME_DIR}" "$@"
}

ANDROID_DATA_PROTECTION_RUNTIME_DIR="$(normalize_host_path "${ANDROID_DATA_PROTECTION_RUNTIME_ROOT}")"

echo "[android-preview] step 1/${PREVIEW_TOTAL_STEPS}: sync to android preview workspace"
ensure_host_dir "${ANDROID_WINDOWS_MIRROR_DIR}"
if ! run_timed_preview_step "android-source-sync" "${ANDROID_PREVIEW_SYNC_TIMEOUT_SECONDS}" env ANDROID_WINDOWS_WORKDIR="${ANDROID_WINDOWS_WORKDIR}" bash "${ANDROID_SOURCE_SYNC_SCRIPT}"; then
  echo "[android-preview] failed at: windows sync"
  echo "[android-preview] status: FAILED"
  exit 1
fi

echo "[android-preview] step 2/${PREVIEW_TOTAL_STEPS}: sync capacitor android host"
if ! run_timed_preview_step "android-cap-sync" "${ANDROID_PREVIEW_CAP_SYNC_TIMEOUT_SECONDS}" env ANDROID_SKIP_WINDOWS_SYNC=1 ANDROID_WINDOWS_WORKDIR="${ANDROID_WINDOWS_WORKDIR}" bash "${ANDROID_SYNC_SCRIPT}"; then
  echo "[android-preview] failed at: android host sync"
  echo "[android-preview] status: FAILED"
  exit 1
fi

if [[ "${ANDROID_DATA_PROTECTION}" != "0" && "${ANDROID_ELECTRON_ABI_PREPARE}" != "0" ]]; then
  echo "[android-preview] prepare Electron native ABI in data protection runtime"
  if ! run_runtime_timed_step "electron-native-abi" "${ANDROID_PREVIEW_NATIVE_ABI_TIMEOUT_SECONDS}" \
    node "${ANDROID_NATIVE_ABI_REPAIR_SCRIPT}" --repo-root .; then
    echo "[android-preview] failed at: Electron native ABI"
    echo "[android-preview] status: FAILED"
    exit 1
  fi
fi

if [[ -n "${ANDROID_PREVIEW_TARGET_SERIAL}" || -n "${ANDROID_PREVIEW_AVD}" ]]; then
  if [[ -n "${ANDROID_PREVIEW_AVD}" ]]; then
    echo "[android-preview] step 3/${PREVIEW_TOTAL_STEPS}: start emulator"
    if ! run_timed_preview_step "android-emulator" "${ANDROID_PREVIEW_EMULATOR_TIMEOUT_SECONDS}" bash "${ANDROID_EMULATOR_SCRIPT}" "${ANDROID_PREVIEW_AVD}"; then
      echo "[android-preview] failed at: emulator startup"
      echo "[android-preview] status: FAILED"
      exit 1
    fi
  else
    echo "[android-preview] real device target: ${ANDROID_PREVIEW_TARGET_SERIAL}"
  fi
  DATA_PROTECTION_MANIFEST=""
  if [[ "${ANDROID_DATA_PROTECTION}" != "0" ]]; then
    ensure_host_dir "${ANDROID_DATA_PROTECTION_BACKUP_DIR}"
    ensure_host_dir "${ANDROID_DATA_PROTECTION_MANIFEST_DIR}"
    DATA_PROTECTION_MANIFEST="${ANDROID_DATA_PROTECTION_MANIFEST_DIR}/android-preview-before-$(date +%Y%m%d-%H%M%S).json"
    echo "[android-preview] step 4/${PREVIEW_TOTAL_STEPS}: backup android app data"
    if ! run_runtime_timed_step "android-data-backup" "${ANDROID_PREVIEW_DATA_PROTECTION_TIMEOUT_SECONDS}" "${ANDROID_DATA_PROTECTION_NODE}" "${ANDROID_DATA_PROTECTION_SCRIPT}" --mode backup --backup-root "${ANDROID_DATA_PROTECTION_BACKUP_DIR}" --manifest "${DATA_PROTECTION_MANIFEST}" --serial "${ANDROID_PREVIEW_TARGET_SERIAL}"; then
      echo "[android-preview] failed at: data protection preflight"
      echo "[android-preview] status: FAILED"
      exit 1
    fi
  fi
  DEPLOY_STEP=4
  if [[ -n "${ANDROID_PREVIEW_TARGET_SERIAL}" ]]; then
    DEPLOY_STEP=3
  fi
  if [[ "${ANDROID_DATA_PROTECTION}" != "0" ]]; then
    DEPLOY_STEP=4
    if [[ -n "${ANDROID_PREVIEW_AVD}" ]]; then
      DEPLOY_STEP=5
    fi
  fi
  echo "[android-preview] step ${DEPLOY_STEP}/${PREVIEW_TOTAL_STEPS}: deploy app"
  if ! run_timed_preview_step "android-deploy" "${ANDROID_PREVIEW_DEPLOY_TIMEOUT_SECONDS}" env ANDROID_WINDOWS_WORKDIR="${ANDROID_WINDOWS_WORKDIR}" FOLIOLE_ANDROID_PREVIEW_DEPLOY=1 bash "${ANDROID_DEPLOY_SCRIPT}"; then
    echo "[android-preview] failed at: app deploy"
    echo "[android-preview] status: FAILED"
    exit 1
  fi
  if [[ "${ANDROID_PREVIEW_SYNC_STATE_CHECK}" != "0" ]]; then
    echo "[android-preview] checking companion sync readiness"
    if ! run_runtime_timed_step "android-sync-state" "${ANDROID_PREVIEW_SYNC_STATE_TIMEOUT_SECONDS}" node "${ELECTRON_SQLITE_RUNNER}" "${ANDROID_SYNC_STATE_SCRIPT}"; then
      echo "[android-preview] sync readiness check failed; continuing with opened preview"
    fi
  fi
  if [[ "${ANDROID_DATA_PROTECTION}" != "0" ]]; then
    echo "[android-preview] step 6/${PREVIEW_TOTAL_STEPS}: check android app data"
    if ! run_runtime_timed_step "android-data-check" "${ANDROID_PREVIEW_DATA_PROTECTION_TIMEOUT_SECONDS}" "${ANDROID_DATA_PROTECTION_NODE}" "${ANDROID_DATA_PROTECTION_SCRIPT}" --mode check --backup-root "${ANDROID_DATA_PROTECTION_BACKUP_DIR}" --manifest "${DATA_PROTECTION_MANIFEST}" --serial "${ANDROID_PREVIEW_TARGET_SERIAL}"; then
      echo "[android-preview] failed at: data protection check"
      echo "[android-preview] status: FAILED"
      exit 1
    fi
  fi
  echo "[android-preview] timings: ${ANDROID_PREVIEW_TIMINGS}"
  echo "[android-preview] status: OPENED"
  exit 0
fi

if [[ "${ANDROID_PREVIEW_OPEN_STUDIO}" != "0" ]]; then
  echo "[android-preview] step 3/${PREVIEW_TOTAL_STEPS}: open android studio"
  if ! run_timed_preview_step "android-open-studio" "${ANDROID_PREVIEW_OPEN_STUDIO_TIMEOUT_SECONDS}" env ANDROID_WINDOWS_WORKDIR="${ANDROID_WINDOWS_WORKDIR}" bash "${ANDROID_OPEN_SCRIPT}"; then
    echo "[android-preview] failed at: android studio launch"
    echo "[android-preview] status: FAILED"
    exit 1
  fi
  echo "[android-preview] timings: ${ANDROID_PREVIEW_TIMINGS}"
  echo "[android-preview] status: OPENED"
  exit 0
fi

echo "[android-preview] step 3/${PREVIEW_TOTAL_STEPS}: preview sync complete"
echo "[android-preview] timings: ${ANDROID_PREVIEW_TIMINGS}"
echo "[android-preview] status: SYNCED"
