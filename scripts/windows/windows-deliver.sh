#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WINDOWS_RESTART_CLIENT_MODE="${WINDOWS_RESTART_CLIENT_MODE:-auto}" # auto|always|never

cd "${REPO_ROOT}"

echo "[windows-deliver] step 1/3: quality gate"
bash scripts/quality-gate.sh

echo "[windows-deliver] step 2/3: sync to windows mirror"
bash scripts/windows/windows-sync.sh

case "${WINDOWS_RESTART_CLIENT_MODE}" in
  always|never|auto)
    ;;
  *)
    echo "[windows-deliver] invalid WINDOWS_RESTART_CLIENT_MODE: ${WINDOWS_RESTART_CLIENT_MODE}"
    exit 1
    ;;
esac

echo "[windows-deliver] step 3/3: ensure windows client state (mode=${WINDOWS_RESTART_CLIENT_MODE})"
status_log="$(mktemp)"
trap 'rm -f "${status_log}"' EXIT
WINDOWS_CLIENT_ACTION=status bash scripts/windows/windows-restart-client.sh | tee "${status_log}"
client_running="false"
if grep -q "status: RUNNING" "${status_log}"; then
  client_running="true"
fi

if [[ "${WINDOWS_RESTART_CLIENT_MODE}" == "never" ]]; then
  echo "[windows-deliver] restart: SKIPPED (mode=never)"
elif [[ "${WINDOWS_RESTART_CLIENT_MODE}" == "always" ]]; then
  if [[ "${client_running}" == "true" ]]; then
    WINDOWS_CLIENT_ACTION=restart bash scripts/windows/windows-restart-client.sh
    echo "[windows-deliver] restart: RESTARTED"
  else
    WINDOWS_CLIENT_ACTION=start bash scripts/windows/windows-restart-client.sh
    echo "[windows-deliver] restart: STARTED (client was stopped)"
  fi
elif [[ "${client_running}" != "true" ]]; then
  WINDOWS_CLIENT_ACTION=start bash scripts/windows/windows-restart-client.sh
  echo "[windows-deliver] restart: STARTED (client was stopped)"
else
  echo "[windows-deliver] restart: SKIPPED (client already running)"
fi

echo "[windows-deliver] status: DELIVERED"
