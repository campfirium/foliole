#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WINDOWS_WORKDIR="${WINDOWS_WORKDIR:-C:\\dev\\foliole}"
WINDOWS_CLIENT_ACTION="${WINDOWS_CLIENT_ACTION:-status}"

PS_SCRIPT_WIN_PATH="$(wslpath -w "${SCRIPT_DIR}/restart-electron-dev.ps1")"

cd "${REPO_ROOT}"
echo "[windows-restart-client] action=${WINDOWS_CLIENT_ACTION}"
echo "[windows-restart-client] workdir=${WINDOWS_WORKDIR}"

FOLIOLE_RUNTIME_HEAD="${FOLIOLE_RUNTIME_HEAD:-$(git rev-parse HEAD 2>/dev/null || true)}"
powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${PS_SCRIPT_WIN_PATH}" -Action "${WINDOWS_CLIENT_ACTION}" -WindowsWorkDir "${WINDOWS_WORKDIR}" -RuntimeHead "${FOLIOLE_RUNTIME_HEAD}"
