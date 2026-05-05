#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WINDOWS_SCRIPT_PATH="${WINDOWS_SCRIPT_PATH:-${SCRIPT_DIR}/windows-gradle-check.ps1}"
WINDOWS_SYNC_SCRIPT="${WINDOWS_SYNC_SCRIPT:-${SCRIPT_DIR}/../windows/windows-sync.sh}"
ANDROID_WINDOWS_WORKDIR="${ANDROID_WINDOWS_WORKDIR:-C:\dev\foliole-android-preview}"
ANDROID_WINDOWS_MIRROR_DIR="${ANDROID_WINDOWS_MIRROR_DIR:-$(wslpath -u "${ANDROID_WINDOWS_WORKDIR}")}"
ANDROID_SKIP_WINDOWS_SYNC="${ANDROID_SKIP_WINDOWS_SYNC:-}"
TASK_NAME="${1:-}"

if [[ -z "${TASK_NAME}" ]]; then
  cat <<'EOF'
Usage: bash scripts/android/windows-gradle-check.sh <gradle-task>

Run an Android Gradle verification task in the dedicated Android preview workspace.
Examples:
  bash scripts/android/windows-gradle-check.sh lint
  bash scripts/android/windows-gradle-check.sh testDebugUnitTest
EOF
  exit 1
fi

if [[ -z "${ANDROID_SKIP_WINDOWS_SYNC}" ]]; then
  mkdir -p "${ANDROID_WINDOWS_MIRROR_DIR}"
  env WINDOWS_MIRROR_DIR="${ANDROID_WINDOWS_MIRROR_DIR}" bash "${WINDOWS_SYNC_SCRIPT}"
fi

powershell.exe \
  -NoProfile \
  -ExecutionPolicy Bypass \
  -File "$(wslpath -w "${WINDOWS_SCRIPT_PATH}")" \
  -WindowsWorkDir "${ANDROID_WINDOWS_WORKDIR}" \
  -TaskName "${TASK_NAME}"
