#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/android-windows-workdir.sh"
WINDOWS_SCRIPT_PATH="${WINDOWS_SCRIPT_PATH:-${SCRIPT_DIR}/windows-open.ps1}"

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: bash scripts/android/windows-open.sh

Open the Android host project in Windows Android Studio.
EOF
  exit 0
fi

powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "$(android_shell_path_to_windows_path "${WINDOWS_SCRIPT_PATH}")" -WindowsWorkDir "${ANDROID_WINDOWS_WORKDIR}"
