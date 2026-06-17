#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/android-windows-workdir.sh"
WINDOWS_SCRIPT_PATH="${WINDOWS_SCRIPT_PATH:-${SCRIPT_DIR}/windows-control-device.ps1}"
FOLIOLE_ANDROID_SERIAL="${FOLIOLE_ANDROID_SERIAL:-${ANDROID_SERIAL:-}}"

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: bash scripts/android/windows-control-device.sh

Open a scrcpy control window for the selected Android device.
EOF
  exit 0
fi

POWERSHELL_ARGS=(
  -NoProfile
  -WindowStyle Hidden
  -ExecutionPolicy Bypass
  -File "$(android_shell_path_to_windows_path "${WINDOWS_SCRIPT_PATH}")"
)

if [[ -n "${FOLIOLE_ANDROID_SERIAL}" ]]; then
  POWERSHELL_ARGS+=(-TargetSerial "${FOLIOLE_ANDROID_SERIAL}")
fi

powershell.exe "${POWERSHELL_ARGS[@]}"
