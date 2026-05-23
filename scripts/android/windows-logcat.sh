#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/android-windows-workdir.sh"
WINDOWS_SCRIPT_PATH="${WINDOWS_SCRIPT_PATH:-${SCRIPT_DIR}/windows-logcat.ps1}"
PACKAGE_NAME="${1:-${FOLIOLE_ANDROID_PACKAGE:-}}"

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: bash scripts/android/windows-logcat.sh [package-name]

Follow Android logcat on Windows.
If a package name is provided, filter to that package pid when possible.
EOF
  exit 0
fi

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(android_shell_path_to_windows_path "${WINDOWS_SCRIPT_PATH}")" -PackageName "${PACKAGE_NAME}"
