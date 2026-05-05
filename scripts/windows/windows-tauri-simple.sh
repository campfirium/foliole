#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LOG_DIR="${REPO_ROOT}/logs/windows"
PS_SCRIPT="${SCRIPT_DIR}/run-windows-tauri-simple.ps1"
WINDOWS_WORKDIR="${WINDOWS_WORKDIR:-C:\\dev\\foliole}"
ACTION="${1:-start}"

case "${ACTION}" in
  start|stop|restart|status)
    ;;
  *)
    echo "[windows-tauri-simple] unsupported action: ${ACTION}"
    echo "[windows-tauri-simple] usage: bash scripts/windows/windows-tauri-simple.sh [start|stop|restart|status]"
    exit 2
    ;;
esac

if ! command -v powershell.exe >/dev/null 2>&1; then
  echo "[windows-tauri-simple] powershell.exe not found. Run this command inside WSL on Windows."
  exit 1
fi

if [[ ! -f "${PS_SCRIPT}" ]]; then
  echo "[windows-tauri-simple] missing PowerShell script: ${PS_SCRIPT}"
  exit 1
fi

DISTRO="${WSL_DISTRO_NAME:-}"
if [[ -z "${DISTRO}" ]]; then
  echo "[windows-tauri-simple] WSL_DISTRO_NAME is empty. Cannot resolve \\\\wsl.localhost distro name."
  exit 1
fi

mkdir -p "${LOG_DIR}"
PS_SCRIPT_WIN="$(wslpath -w "${PS_SCRIPT}")"
REPO_ROOT_WIN="$(wslpath -w "${REPO_ROOT}")"
LOG_DIR_WIN="$(wslpath -w "${LOG_DIR}")"

echo "[windows-tauri-simple] action: ${ACTION}"
echo "[windows-tauri-simple] distro: ${DISTRO}"
echo "[windows-tauri-simple] source repo (linux): ${REPO_ROOT}"
echo "[windows-tauri-simple] source repo (windows hint): ${REPO_ROOT_WIN}"
echo "[windows-tauri-simple] mirror workdir (windows): ${WINDOWS_WORKDIR}"

PS_ARGS=(
  -NoProfile
  -ExecutionPolicy Bypass
  -File "${PS_SCRIPT_WIN}"
  -Distro "${DISTRO}"
  -SourceRepoLinuxPath "${REPO_ROOT}"
  -WindowsWorkDir "${WINDOWS_WORKDIR}"
  -LogDir "${LOG_DIR_WIN}"
  -Action "${ACTION}"
)

set +e
powershell.exe "${PS_ARGS[@]}"
EXIT_CODE=$?
set -e

if [[ ${EXIT_CODE} -ne 0 ]]; then
  echo "[windows-tauri-simple] failed (exit=${EXIT_CODE})."
  echo "[windows-tauri-simple] inspect logs in: ${LOG_DIR}"
  exit "${EXIT_CODE}"
fi

echo "[windows-tauri-simple] action completed."
