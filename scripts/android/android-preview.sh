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

cd "${REPO_ROOT}"

echo "[android-preview] step 1/3: sync to windows mirror"
bash "${WINDOWS_SYNC_SCRIPT}"

echo "[android-preview] step 2/3: sync capacitor android host"
if ! bash "${ANDROID_SYNC_SCRIPT}"; then
  echo "[android-preview] status: FAILED"
  exit 1
fi

if [[ -n "${ANDROID_PREVIEW_AVD}" ]]; then
  echo "[android-preview] step 3/3: start emulator"
  if ! bash "${ANDROID_EMULATOR_SCRIPT}" "${ANDROID_PREVIEW_AVD}"; then
    echo "[android-preview] status: FAILED"
    exit 1
  fi
  echo "[android-preview] step 3/3: deploy app"
  if ! bash "${ANDROID_DEPLOY_SCRIPT}"; then
    echo "[android-preview] status: FAILED"
    exit 1
  fi
  echo "[android-preview] status: OPENED"
  exit 0
fi

if [[ "${ANDROID_PREVIEW_OPEN_STUDIO}" != "0" ]]; then
  echo "[android-preview] step 3/3: open android studio"
  if ! bash "${ANDROID_OPEN_SCRIPT}"; then
    echo "[android-preview] status: FAILED"
    exit 1
  fi
  echo "[android-preview] status: OPENED"
  exit 0
fi

echo "[android-preview] step 3/3: preview sync complete"
echo "[android-preview] status: SYNCED"
