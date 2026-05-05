#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WINDOWS_RESTART_CLIENT_MODE="${WINDOWS_RESTART_CLIENT_MODE:-auto}" # auto|always|never

cd "${REPO_ROOT}"

echo "[windows-deliver] step 1/3: quality gate"
bash scripts/quality-gate.sh

echo "[windows-deliver] step 2/3: sync to windows mirror"
change_log="$(mktemp)"
trap 'rm -f "${change_log}"' EXIT
WINDOWS_SYNC_CHANGE_LOG="${change_log}" bash scripts/windows/windows-sync.sh

needs_restart="false"
if grep -Eq '(^|[[:space:]])(>f|cd|\*deleting)' "${change_log}"; then
  if grep -Eq '(tailwind\.config\.(js|ts)|postcss\.config\.(js|ts|cjs|mjs)|vite\.config\.(js|ts|cjs|mjs)|package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|src-tauri/|\.env(\.|$)|tsconfig(\..+)?\.json)' "${change_log}"; then
    needs_restart="true"
  fi
fi

case "${WINDOWS_RESTART_CLIENT_MODE}" in
  always)
    needs_restart="true"
    ;;
  never)
    needs_restart="false"
    ;;
  auto)
    ;;
  *)
    echo "[windows-deliver] invalid WINDOWS_RESTART_CLIENT_MODE: ${WINDOWS_RESTART_CLIENT_MODE}"
    exit 1
    ;;
esac

echo "[windows-deliver] step 3/3: ensure windows client state (mode=${WINDOWS_RESTART_CLIENT_MODE})"
status_log="$(mktemp)"
trap 'rm -f "${change_log}" "${status_log}"' EXIT
WINDOWS_CLIENT_ACTION=status bash scripts/windows/windows-restart-client.sh | tee "${status_log}"
client_running="false"
if grep -q "status: RUNNING" "${status_log}"; then
  client_running="true"
fi

if [[ "${needs_restart}" == "true" ]]; then
  WINDOWS_CLIENT_ACTION=restart bash scripts/windows/windows-restart-client.sh
  echo "[windows-deliver] restart: RESTARTED"
elif [[ "${client_running}" != "true" ]]; then
  WINDOWS_CLIENT_ACTION=start bash scripts/windows/windows-restart-client.sh
  echo "[windows-deliver] restart: STARTED"
else
  echo "[windows-deliver] restart: SKIPPED"
fi

echo "[windows-deliver] status: DELIVERED"
