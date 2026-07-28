#!/usr/bin/env bash

run_android_preview_dev_server() {
  set -euo pipefail

  local script_dir repo_root
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  repo_root="$(cd "${script_dir}/../.." && pwd)"
  source "${script_dir}/android-windows-workdir.sh"

  ANDROID_SOURCE_SYNC_SCRIPT="${ANDROID_SOURCE_SYNC_SCRIPT:-scripts/android/windows-source-sync.sh}"
  ANDROID_DEV_SERVER_START_SCRIPT="${ANDROID_DEV_SERVER_START_SCRIPT:-scripts/windows/windows-android-dev-server.mjs}"
  ANDROID_DEV_SERVER_SYNC_SCRIPT="${ANDROID_DEV_SERVER_SYNC_SCRIPT:-scripts/android/windows-cap-sync-dev-server.ps1}"
  ANDROID_DEPLOY_SCRIPT="${ANDROID_DEPLOY_SCRIPT:-scripts/android/windows-deploy-app.sh}"
  ANDROID_DEV_SERVER_LAUNCH_SCRIPT="${ANDROID_DEV_SERVER_LAUNCH_SCRIPT:-scripts/android/windows-dev-server-launch.ps1}"
  ANDROID_DEV_SERVER_URL="${ANDROID_DEV_SERVER_URL:-http://127.0.0.1:24604}"
  ANDROID_DEV_SERVER_PORT="${ANDROID_DEV_SERVER_PORT:-24604}"
  ANDROID_DEV_SYNC_PORT="${ANDROID_DEV_SYNC_PORT:-38641}"
  ANDROID_PREVIEW_TARGET_SERIAL="${FOLIOLE_ANDROID_SERIAL:-${ANDROID_SERIAL:-}}"

  cd "${repo_root}"

  echo "[android-dev-server-preview] step 1/5: start companion dev server"
  node "${ANDROID_DEV_SERVER_START_SCRIPT}" start companion

  echo "[android-dev-server-preview] step 2/5: sync to android preview workspace"
  if [[ "${ANDROID_PREVIEW_SKIP_SOURCE_SYNC:-0}" != "0" ]]; then
    echo "[android-dev-server-preview] source sync skipped: using controlled checkout"
  else
    env ANDROID_WINDOWS_WORKDIR="${ANDROID_WINDOWS_WORKDIR}" bash "${ANDROID_SOURCE_SYNC_SCRIPT}"
  fi

  echo "[android-dev-server-preview] step 3/5: sync Capacitor dev-server config"
  POWERSHELL_SYNC_ARGS=(
    -NoProfile
    -WindowStyle Hidden
    -ExecutionPolicy Bypass
    -File "$(android_shell_path_to_windows_path "${ANDROID_DEV_SERVER_SYNC_SCRIPT}")"
    -WindowsWorkDir "${ANDROID_WINDOWS_WORKDIR}"
    -ServerUrl "${ANDROID_DEV_SERVER_URL}"
  )
  powershell.exe "${POWERSHELL_SYNC_ARGS[@]}"

  echo "[android-dev-server-preview] step 4/5: install dev-server preview app"
  env \
    ANDROID_WINDOWS_WORKDIR="${ANDROID_WINDOWS_WORKDIR}" \
    FOLIOLE_ANDROID_ALLOW_DIRECT_DEPLOY=1 \
    ANDROID_GRADLE_STOP_AFTER_DEPLOY="${ANDROID_GRADLE_STOP_AFTER_DEPLOY:-1}" \
    FOLIOLE_ANDROID_SERIAL="${ANDROID_PREVIEW_TARGET_SERIAL}" \
    bash "${ANDROID_DEPLOY_SCRIPT}"

  echo "[android-dev-server-preview] step 5/5: configure adb reverse and restart app"
  POWERSHELL_LAUNCH_ARGS=(
    -NoProfile
    -WindowStyle Hidden
    -ExecutionPolicy Bypass
    -File "$(android_shell_path_to_windows_path "${ANDROID_DEV_SERVER_LAUNCH_SCRIPT}")"
    -WindowsWorkDir "${ANDROID_WINDOWS_WORKDIR}"
    -DevServerPort "${ANDROID_DEV_SERVER_PORT}"
    -DevSyncPort "${ANDROID_DEV_SYNC_PORT}"
  )
  if [[ -n "${ANDROID_PREVIEW_TARGET_SERIAL}" ]]; then
    POWERSHELL_LAUNCH_ARGS+=(-TargetSerial "${ANDROID_PREVIEW_TARGET_SERIAL}")
  fi
  powershell.exe "${POWERSHELL_LAUNCH_ARGS[@]}"

  echo "[android-dev-server-preview] url: ${ANDROID_DEV_SERVER_URL}"
  echo "[android-dev-server-preview] status: OPENED"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  if [[ "$(/usr/bin/uname -s)" == "Darwin" ]]; then
    echo "[android-dev-server-preview] refused: macOS is controller-only for Android. Use scripts/windows/windows-android-lab-control.mjs." >&2
    exit 2
  fi
  run_android_preview_dev_server
fi
