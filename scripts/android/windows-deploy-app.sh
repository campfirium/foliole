#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/android-windows-workdir.sh"
WINDOWS_SCRIPT_PATH="${WINDOWS_SCRIPT_PATH:-${SCRIPT_DIR}/windows-deploy-app.ps1}"
ANDROID_GRADLE_STOP_AFTER_DEPLOY="${ANDROID_GRADLE_STOP_AFTER_DEPLOY:-0}"

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: bash scripts/android/windows-deploy-app.sh

Build, install, and launch the Android debug app on the active emulator/device.
EOF
  exit 0
fi

POWERSHELL_ARGS=(
  -NoProfile
  -ExecutionPolicy Bypass
  -File "$(wslpath -w "${WINDOWS_SCRIPT_PATH}")"
  -WindowsWorkDir "${ANDROID_WINDOWS_WORKDIR}"
)

if [[ "${ANDROID_GRADLE_STOP_AFTER_DEPLOY}" == "1" ]]; then
  POWERSHELL_ARGS+=(-StopGradleDaemon)
fi

coproc DEPLOY_PS { powershell.exe "${POWERSHELL_ARGS[@]}" 2>&1; }
DEPLOY_PS_PROCESS_PID="$!"
DEPLOY_STATUS_OPENED=0

while IFS= read -r line <&"${DEPLOY_PS[0]}"; do
  echo "${line}"
  if [[ "${line}" == *"[android-deploy] status: OPENED"* ]]; then
    DEPLOY_STATUS_OPENED=1
    break
  fi
done

if [[ "${DEPLOY_STATUS_OPENED}" == "1" ]]; then
  for _ in {1..50}; do
    if ! kill -0 "${DEPLOY_PS_PROCESS_PID}" >/dev/null 2>&1; then
      wait "${DEPLOY_PS_PROCESS_PID}"
      exit $?
    fi
    sleep 0.1
  done
  kill "${DEPLOY_PS_PROCESS_PID}" >/dev/null 2>&1 || true
  wait "${DEPLOY_PS_PROCESS_PID}" >/dev/null 2>&1 || true
  exit 0
fi

set +e
wait "${DEPLOY_PS_PROCESS_PID}"
DEPLOY_EXIT_CODE=$?
set -e
exit "${DEPLOY_EXIT_CODE}"
