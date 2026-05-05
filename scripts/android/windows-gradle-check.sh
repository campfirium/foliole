#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WINDOWS_SCRIPT_PATH="${WINDOWS_SCRIPT_PATH:-${SCRIPT_DIR}/windows-gradle-check.ps1}"
TASK_NAME="${1:-}"

if [[ -z "${TASK_NAME}" ]]; then
  cat <<'EOF'
Usage: bash scripts/android/windows-gradle-check.sh <gradle-task>

Run an Android Gradle verification task in the Windows mirror repository.
Examples:
  bash scripts/android/windows-gradle-check.sh lint
  bash scripts/android/windows-gradle-check.sh testDebugUnitTest
EOF
  exit 1
fi

powershell.exe \
  -NoProfile \
  -ExecutionPolicy Bypass \
  -File "$(wslpath -w "${WINDOWS_SCRIPT_PATH}")" \
  -TaskName "${TASK_NAME}"
