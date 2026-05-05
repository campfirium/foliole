#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"

ensure_windows_client_running() {
  local status_output
  status_output="$(
    WINDOWS_CLIENT_ACTION=status bash scripts/windows/windows-restart-client.sh 2>&1 || true
  )"

  if echo "${status_output}" | grep -qE 'status:\s*RUNNING'; then
    echo "[windows-preview] windows client: RUNNING"
    return 0
  fi

  if echo "${status_output}" | grep -qE 'status:\s*STOPPED'; then
    echo "[windows-preview] windows client: STOPPED; starting"
    WINDOWS_CLIENT_ACTION=start bash scripts/windows/windows-restart-client.sh || true

    status_output="$(
      WINDOWS_CLIENT_ACTION=status bash scripts/windows/windows-restart-client.sh 2>&1 || true
    )"
    if echo "${status_output}" | grep -qE 'status:\s*RUNNING'; then
      echo "[windows-preview] windows client: RUNNING (after start)"
      return 0
    fi

    echo "[windows-preview] windows client: failed to start"
    echo "${status_output}"
    return 1
  fi

  echo "[windows-preview] windows client: unknown status"
  echo "${status_output}"
  return 1
}

echo "[windows-preview] step 1/2: sync to windows mirror"
bash scripts/windows/windows-sync.sh

changed_files="$(
  {
    git diff --name-only
    git diff --name-only --cached
    git ls-files --others --exclude-standard
  } | sort -u
)"

if echo "${changed_files}" | grep -qE '^electron/'; then
  ensure_windows_client_running
  echo "[windows-preview] step 2/2: electron changes detected; restarting windows client"
  WINDOWS_CLIENT_ACTION=restart bash scripts/windows/windows-restart-client.sh
  echo "[windows-preview] status: RESTARTED"
else
  ensure_windows_client_running
  echo "[windows-preview] step 2/2: no electron changes; waiting for renderer HMR"
  echo "[windows-preview] status: SYNCED"
fi
