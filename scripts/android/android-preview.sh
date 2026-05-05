#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
source "${SCRIPT_DIR}/android-windows-workdir.sh"
WINDOWS_SYNC_SCRIPT="${WINDOWS_SYNC_SCRIPT:-scripts/windows/windows-sync.sh}"
ANDROID_SYNC_SCRIPT="${ANDROID_SYNC_SCRIPT:-scripts/android/windows-cap-sync.sh}"
ANDROID_OPEN_SCRIPT="${ANDROID_OPEN_SCRIPT:-scripts/android/windows-open.sh}"
ANDROID_EMULATOR_SCRIPT="${ANDROID_EMULATOR_SCRIPT:-scripts/android/windows-run-emulator.sh}"
ANDROID_DEPLOY_SCRIPT="${ANDROID_DEPLOY_SCRIPT:-scripts/android/windows-deploy-app.sh}"
ANDROID_PREVIEW_OPEN_STUDIO="${ANDROID_PREVIEW_OPEN_STUDIO:-1}"
DEFAULT_ANDROID_AVD="${DEFAULT_ANDROID_AVD:-Foliole_API_36}"
ANDROID_PREVIEW_AVD="${ANDROID_PREVIEW_AVD-${FOLIOLE_ANDROID_AVD-${DEFAULT_ANDROID_AVD}}}"
ANDROID_PREVIEW_SYNC_TIMEOUT_SECONDS="${ANDROID_PREVIEW_SYNC_TIMEOUT_SECONDS:-600}"
ANDROID_PREVIEW_CAP_SYNC_TIMEOUT_SECONDS="${ANDROID_PREVIEW_CAP_SYNC_TIMEOUT_SECONDS:-600}"
ANDROID_PREVIEW_EMULATOR_TIMEOUT_SECONDS="${ANDROID_PREVIEW_EMULATOR_TIMEOUT_SECONDS:-240}"
ANDROID_PREVIEW_DEPLOY_TIMEOUT_SECONDS="${ANDROID_PREVIEW_DEPLOY_TIMEOUT_SECONDS:-600}"
ANDROID_PREVIEW_OPEN_STUDIO_TIMEOUT_SECONDS="${ANDROID_PREVIEW_OPEN_STUDIO_TIMEOUT_SECONDS:-60}"
ANDROID_PREVIEW_KILL_AFTER_SECONDS="${ANDROID_PREVIEW_KILL_AFTER_SECONDS:-10}"
PREVIEW_TOTAL_STEPS=3

if [[ -n "${ANDROID_PREVIEW_AVD}" ]]; then
  PREVIEW_TOTAL_STEPS=4
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
  return "${exit_code}"
}

run_with_timeout() {
  local timeout_seconds="$1"
  shift

  if command -v timeout >/dev/null 2>&1; then
    timeout --kill-after="${ANDROID_PREVIEW_KILL_AFTER_SECONDS}" "${timeout_seconds}" "$@"
    return $?
  fi

  "$@"
}

run_timed_preview_step() {
  local label="$1"
  local timeout_seconds="$2"
  shift 2

  echo "[android-preview] ${label} timeout: ${timeout_seconds}s"
  run_preview_step "${label}" run_with_timeout "${timeout_seconds}" "$@"
}

echo "[android-preview] step 1/${PREVIEW_TOTAL_STEPS}: sync to android preview workspace"
mkdir -p "${ANDROID_WINDOWS_MIRROR_DIR}"
if ! run_timed_preview_step "windows-sync" "${ANDROID_PREVIEW_SYNC_TIMEOUT_SECONDS}" env WINDOWS_MIRROR_DIR="${ANDROID_WINDOWS_MIRROR_DIR}" bash "${WINDOWS_SYNC_SCRIPT}"; then
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

if [[ -n "${ANDROID_PREVIEW_AVD}" ]]; then
  echo "[android-preview] step 3/${PREVIEW_TOTAL_STEPS}: start emulator"
  if ! run_timed_preview_step "android-emulator" "${ANDROID_PREVIEW_EMULATOR_TIMEOUT_SECONDS}" bash "${ANDROID_EMULATOR_SCRIPT}" "${ANDROID_PREVIEW_AVD}"; then
    echo "[android-preview] failed at: emulator startup"
    echo "[android-preview] status: FAILED"
    exit 1
  fi
  echo "[android-preview] step 4/${PREVIEW_TOTAL_STEPS}: deploy app"
  if ! run_timed_preview_step "android-deploy" "${ANDROID_PREVIEW_DEPLOY_TIMEOUT_SECONDS}" env ANDROID_WINDOWS_WORKDIR="${ANDROID_WINDOWS_WORKDIR}" bash "${ANDROID_DEPLOY_SCRIPT}"; then
    echo "[android-preview] failed at: app deploy"
    echo "[android-preview] status: FAILED"
    exit 1
  fi
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
  echo "[android-preview] status: OPENED"
  exit 0
fi

echo "[android-preview] step 3/${PREVIEW_TOTAL_STEPS}: preview sync complete"
echo "[android-preview] status: SYNCED"
