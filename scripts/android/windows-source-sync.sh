#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
source "${SCRIPT_DIR}/android-windows-workdir.sh"
WINDOWS_SCRIPT_PATH="${WINDOWS_SCRIPT_PATH:-${SCRIPT_DIR}/windows-source-sync.ps1}"
ANDROID_SOURCE_SYNC_SOURCE_DIR="${ANDROID_SOURCE_SYNC_SOURCE_DIR:-${REPO_ROOT}}"

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: bash scripts/android/windows-source-sync.sh

Copy the repository source into the dedicated Android preview workspace.
EOF
  exit 0
fi

powershell.exe \
  -NoProfile \
  -WindowStyle Hidden \
  -ExecutionPolicy Bypass \
  -File "$(android_shell_path_to_windows_path "${WINDOWS_SCRIPT_PATH}")" \
  -SourceDir "$(android_shell_path_to_windows_path "${ANDROID_SOURCE_SYNC_SOURCE_DIR}")" \
  -WindowsWorkDir "${ANDROID_WINDOWS_WORKDIR}"
