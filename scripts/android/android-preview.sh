#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WINDOWS_SYNC_SCRIPT="${WINDOWS_SYNC_SCRIPT:-scripts/windows/windows-sync.sh}"
ANDROID_SYNC_SCRIPT="${ANDROID_SYNC_SCRIPT:-scripts/android/windows-cap-sync.sh}"
ANDROID_OPEN_SCRIPT="${ANDROID_OPEN_SCRIPT:-scripts/android/windows-open.sh}"
ANDROID_EMULATOR_SCRIPT="${ANDROID_EMULATOR_SCRIPT:-scripts/android/windows-run-emulator.sh}"
ANDROID_DEPLOY_SCRIPT="${ANDROID_DEPLOY_SCRIPT:-scripts/android/windows-deploy-app.sh}"
ANDROID_PREVIEW_OPEN_STUDIO="${ANDROID_PREVIEW_OPEN_STUDIO:-1}"
DEFAULT_ANDROID_AVD="${DEFAULT_ANDROID_AVD:-Foliole_API_36}"
ANDROID_PREVIEW_AVD="${ANDROID_PREVIEW_AVD:-${FOLIOLE_ANDROID_AVD:-${DEFAULT_ANDROID_AVD}}}"
PREVIEW_TOTAL_STEPS=3

if [[ -n "${ANDROID_PREVIEW_AVD}" ]]; then
  PREVIEW_TOTAL_STEPS=4
fi

cd "${REPO_ROOT}"

echo "[android-preview] step 1/${PREVIEW_TOTAL_STEPS}: sync to windows mirror"
bash "${WINDOWS_SYNC_SCRIPT}"

echo "[android-preview] step 2/${PREVIEW_TOTAL_STEPS}: sync capacitor android host"
if ! ANDROID_SKIP_WINDOWS_SYNC=1 bash "${ANDROID_SYNC_SCRIPT}"; then
  echo "[android-preview] failed at: android host sync"
  echo "[android-preview] status: FAILED"
  exit 1
fi

if [[ -n "${ANDROID_PREVIEW_AVD}" ]]; then
  echo "[android-preview] step 3/${PREVIEW_TOTAL_STEPS}: start emulator"
  if ! bash "${ANDROID_EMULATOR_SCRIPT}" "${ANDROID_PREVIEW_AVD}"; then
    echo "[android-preview] failed at: emulator startup"
    echo "[android-preview] status: FAILED"
    exit 1
  fi
  echo "[android-preview] step 4/${PREVIEW_TOTAL_STEPS}: deploy app"
  if ! bash "${ANDROID_DEPLOY_SCRIPT}"; then
    echo "[android-preview] failed at: app deploy"
    echo "[android-preview] status: FAILED"
    exit 1
  fi
  echo "[android-preview] status: OPENED"
  exit 0
fi

if [[ "${ANDROID_PREVIEW_OPEN_STUDIO}" != "0" ]]; then
  echo "[android-preview] step 3/${PREVIEW_TOTAL_STEPS}: open android studio"
  if ! bash "${ANDROID_OPEN_SCRIPT}"; then
    echo "[android-preview] failed at: android studio launch"
    echo "[android-preview] status: FAILED"
    exit 1
  fi
  echo "[android-preview] status: OPENED"
  exit 0
fi

echo "[android-preview] step 3/${PREVIEW_TOTAL_STEPS}: preview sync complete"
echo "[android-preview] status: SYNCED"
