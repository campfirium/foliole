#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WINDOWS_SCRIPT_PATH="${WINDOWS_SCRIPT_PATH:-${SCRIPT_DIR}/windows-run-emulator.ps1}"
AVD_NAME="${1:-${FOLIOLE_ANDROID_AVD:-}}"

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: bash scripts/android/windows-run-emulator.sh [avd-name]

Start an Android emulator on Windows.
If no avd name is provided, use FOLIOLE_ANDROID_AVD.
EOF
  exit 0
fi

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w "${WINDOWS_SCRIPT_PATH}")" -AvdName "${AVD_NAME}"
