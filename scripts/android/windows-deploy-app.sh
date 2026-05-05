#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WINDOWS_SCRIPT_PATH="${WINDOWS_SCRIPT_PATH:-${SCRIPT_DIR}/windows-deploy-app.ps1}"
ANDROID_WINDOWS_WORKDIR="${ANDROID_WINDOWS_WORKDIR:-C:\dev\foliole}"

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: bash scripts/android/windows-deploy-app.sh

Build, install, and launch the Android debug app on the active emulator/device.
EOF
  exit 0
fi

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w "${WINDOWS_SCRIPT_PATH}")" -WindowsWorkDir "${ANDROID_WINDOWS_WORKDIR}"
