#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/android-windows-workdir.sh"
WINDOWS_SCRIPT_PATH="${WINDOWS_SCRIPT_PATH:-${SCRIPT_DIR}/windows-screenshot.ps1}"
ANDROID_SCREENSHOT_DIR="${ANDROID_SCREENSHOT_DIR:-.tmp/android-screenshots}"

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: bash scripts/android/windows-screenshot.sh [output-dir]

Capture the current Android emulator/device screen through adb.
EOF
  exit 0
fi

if [[ -n "${1:-}" ]]; then
  ANDROID_SCREENSHOT_DIR="$1"
fi

ANDROID_SCREENSHOT_DIR="$(android_windows_path_to_shell_path "${ANDROID_SCREENSHOT_DIR}")"
mkdir -p "${ANDROID_SCREENSHOT_DIR}"

powershell.exe \
  -NoProfile \
  -ExecutionPolicy Bypass \
  -File "$(android_shell_path_to_windows_path "${WINDOWS_SCRIPT_PATH}")" \
  -OutputDir "$(android_shell_path_to_windows_path "${ANDROID_SCREENSHOT_DIR}")"
