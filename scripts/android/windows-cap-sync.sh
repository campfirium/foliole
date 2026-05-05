#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WINDOWS_SCRIPT_PATH="${WINDOWS_SCRIPT_PATH:-${SCRIPT_DIR}/windows-cap-sync.ps1}"
WINDOWS_SYNC_SCRIPT="${WINDOWS_SYNC_SCRIPT:-${SCRIPT_DIR}/../windows/windows-sync.sh}"
ANDROID_SKIP_WINDOWS_SYNC="${ANDROID_SKIP_WINDOWS_SYNC:-0}"
ANDROID_WINDOWS_WORKDIR="${ANDROID_WINDOWS_WORKDIR:-C:\dev\foliole}"
ANDROID_WINDOWS_MIRROR_DIR="${ANDROID_WINDOWS_MIRROR_DIR:-$(wslpath -u "${ANDROID_WINDOWS_WORKDIR}")}"
ANDROID_WINDOWS_DEPENDENCY_REFRESH="${ANDROID_WINDOWS_DEPENDENCY_REFRESH:-auto}"

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: bash scripts/android/windows-cap-sync.sh

Run `npx cap sync android` in the Windows mirror repository.
EOF
  exit 0
fi

if [[ "${ANDROID_SKIP_WINDOWS_SYNC}" != "1" ]]; then
  mkdir -p "${ANDROID_WINDOWS_MIRROR_DIR}"
  env WINDOWS_MIRROR_DIR="${ANDROID_WINDOWS_MIRROR_DIR}" bash "${WINDOWS_SYNC_SCRIPT}"
fi

powershell.exe \
  -NoProfile \
  -ExecutionPolicy Bypass \
  -File "$(wslpath -w "${WINDOWS_SCRIPT_PATH}")" \
  -WindowsWorkDir "${ANDROID_WINDOWS_WORKDIR}" \
  -DependencyRefresh "${ANDROID_WINDOWS_DEPENDENCY_REFRESH}"
