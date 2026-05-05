#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WINDOWS_SCRIPT_PATH="${WINDOWS_SCRIPT_PATH:-${SCRIPT_DIR}/windows-deploy-app.ps1}"
ANDROID_WINDOWS_WORKDIR="${ANDROID_WINDOWS_WORKDIR:-C:\dev\foliole}"
ANDROID_GRADLE_STOP_AFTER_DEPLOY="${ANDROID_GRADLE_STOP_AFTER_DEPLOY:-0}"

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: bash scripts/android/windows-deploy-app.sh

Build, install, and launch the Android debug app on the active emulator/device.
EOF
  exit 0
fi

POWERSHELL_ARGS=(
  -NoProfile
  -ExecutionPolicy Bypass
  -File "$(wslpath -w "${WINDOWS_SCRIPT_PATH}")"
  -WindowsWorkDir "${ANDROID_WINDOWS_WORKDIR}"
)

if [[ "${ANDROID_GRADLE_STOP_AFTER_DEPLOY}" == "1" ]]; then
  POWERSHELL_ARGS+=(-StopGradleDaemon)
fi

powershell.exe "${POWERSHELL_ARGS[@]}"
