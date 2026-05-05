#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WINDOWS_SCRIPT_PATH="${WINDOWS_SCRIPT_PATH:-${SCRIPT_DIR}/windows-run-emulator.ps1}"
AVD_NAME="${1:-${FOLIOLE_ANDROID_AVD:-}}"
ANDROID_EMULATOR_TIMEZONE="${ANDROID_EMULATOR_TIMEZONE:-${FOLIOLE_ANDROID_TIMEZONE:-${TZ:-}}}"

if [[ -z "${ANDROID_EMULATOR_TIMEZONE}" && -f /etc/timezone ]]; then
  ANDROID_EMULATOR_TIMEZONE="$(tr -d '[:space:]' </etc/timezone)"
fi

ANDROID_EMULATOR_TIMEZONE="${ANDROID_EMULATOR_TIMEZONE:-Asia/Shanghai}"

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: bash scripts/android/windows-run-emulator.sh [avd-name]

Start an Android emulator on Windows.
If no avd name is provided, use FOLIOLE_ANDROID_AVD.
The emulator timezone uses ANDROID_EMULATOR_TIMEZONE, FOLIOLE_ANDROID_TIMEZONE,
TZ, /etc/timezone, then Asia/Shanghai.
EOF
  exit 0
fi

powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "$(wslpath -w "${WINDOWS_SCRIPT_PATH}")" -AvdName "${AVD_NAME}" -Timezone "${ANDROID_EMULATOR_TIMEZONE}"
