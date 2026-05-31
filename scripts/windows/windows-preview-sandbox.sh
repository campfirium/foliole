#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

WINDOWS_WORKDIR="${WINDOWS_WORKDIR:-D:\\C\\foliole}"
export WINDOWS_WORKDIR
export FOLIOLE_NATIVE_PREVIEW_SANDBOX=1
export FOLIOLE_NATIVE_PREVIEW_TEMP_LIBRARY=1
export FOLIOLE_NATIVE_PREVIEW_RESET="${FOLIOLE_NATIVE_PREVIEW_RESET:-1}"
export FOLIOLE_NATIVE_LIBRARY_HOME="${FOLIOLE_NATIVE_LIBRARY_HOME:-D:\\X\\U\\Foliole\\PreviewSandbox}"
export FOLIOLE_NATIVE_USER_DATA_PATH="${FOLIOLE_NATIVE_USER_DATA_PATH:-${WINDOWS_WORKDIR}\\.tmp\\electron-user-data-sandbox}"

append_wslenv_var() {
  local entry="$1/w"
  if [[ ":${WSLENV:-}:" == *":${entry}:"* ]]; then
    return
  fi
  export WSLENV="${WSLENV:+${WSLENV}:}${entry}"
}

append_wslenv_var FOLIOLE_NATIVE_PREVIEW_SANDBOX
append_wslenv_var FOLIOLE_NATIVE_PREVIEW_TEMP_LIBRARY
append_wslenv_var FOLIOLE_NATIVE_PREVIEW_RESET
append_wslenv_var FOLIOLE_NATIVE_LIBRARY_HOME
append_wslenv_var FOLIOLE_NATIVE_USER_DATA_PATH

cd "${REPO_ROOT}"

echo "[windows-preview-sandbox] library_home=${FOLIOLE_NATIVE_LIBRARY_HOME}"
echo "[windows-preview-sandbox] reset=${FOLIOLE_NATIVE_PREVIEW_RESET}"
echo "[windows-preview-sandbox] temporary_library=1"

WINDOWS_CLIENT_ACTION=stop bash "${SCRIPT_DIR}/windows-restart-client.sh" || true
bash "${SCRIPT_DIR}/windows-preview.sh"
