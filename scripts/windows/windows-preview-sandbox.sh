#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

WINDOWS_WORKDIR="${WINDOWS_WORKDIR:-D:\\C\\foliole}"
export WINDOWS_WORKDIR
export FOLIOLE_NATIVE_PREVIEW_SANDBOX=1
export FOLIOLE_NATIVE_PREVIEW_TEMP_LIBRARY=1
export FOLIOLE_NATIVE_PREVIEW_RESET="${FOLIOLE_NATIVE_PREVIEW_RESET:-1}"
export FOLIOLE_NATIVE_USER_DATA_PATH="${FOLIOLE_NATIVE_USER_DATA_PATH:-${WINDOWS_WORKDIR}\\.tmp\\electron-user-data-sandbox}"

SANDBOX_ROOT="${FOLIOLE_NATIVE_PREVIEW_SANDBOX_ROOT:-${WINDOWS_WORKDIR}\\.tmp\\preview-sandbox-library}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sample-locale)
      export FOLIOLE_NATIVE_GUIDED_SAMPLE_LOCALE="${2:-}"
      shift 2
      ;;
    --sample-locale=*)
      export FOLIOLE_NATIVE_GUIDED_SAMPLE_LOCALE="${1#*=}"
      shift
      ;;
    --sandbox-root)
      SANDBOX_ROOT="${2:-}"
      shift 2
      ;;
    --sandbox-root=*)
      SANDBOX_ROOT="${1#*=}"
      shift
      ;;
    *)
      echo "[windows-preview-sandbox] unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

export FOLIOLE_NATIVE_LIBRARY_HOME="${FOLIOLE_NATIVE_LIBRARY_HOME:-${SANDBOX_ROOT}}"

append_wslenv_var() {
  local entry="$1${2:-}"
  if [[ ":${WSLENV:-}:" == *":${entry}:"* ]]; then
    return
  fi
  export WSLENV="${WSLENV:+${WSLENV}:}${entry}"
}

append_wslenv_var FOLIOLE_NATIVE_PREVIEW_SANDBOX
append_wslenv_var FOLIOLE_NATIVE_PREVIEW_TEMP_LIBRARY
append_wslenv_var FOLIOLE_NATIVE_PREVIEW_RESET
append_wslenv_var FOLIOLE_NATIVE_LIBRARY_HOME /w
append_wslenv_var FOLIOLE_NATIVE_USER_DATA_PATH /w
append_wslenv_var FOLIOLE_NATIVE_GUIDED_SAMPLE_LOCALE

cd "${REPO_ROOT}"

echo "[windows-preview-sandbox] library_home=${FOLIOLE_NATIVE_LIBRARY_HOME}"
echo "[windows-preview-sandbox] sample_locale=${FOLIOLE_NATIVE_GUIDED_SAMPLE_LOCALE:-auto}"
echo "[windows-preview-sandbox] reset=${FOLIOLE_NATIVE_PREVIEW_RESET}"
echo "[windows-preview-sandbox] temporary_library=1"

WINDOWS_CLIENT_ACTION=stop bash "${SCRIPT_DIR}/windows-restart-client.sh" || true
bash "${SCRIPT_DIR}/windows-preview.sh"
