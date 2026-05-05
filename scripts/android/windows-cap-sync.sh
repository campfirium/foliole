#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WINDOWS_SCRIPT_PATH="${WINDOWS_SCRIPT_PATH:-${SCRIPT_DIR}/windows-cap-sync.ps1}"

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: bash scripts/android/windows-cap-sync.sh

Run `npx cap sync android` in the Windows mirror repository.
EOF
  exit 0
fi

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w "${WINDOWS_SCRIPT_PATH}")"
