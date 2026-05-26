#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WINDOWS_WORKDIR="${WINDOWS_WORKDIR:-D:\\C\\foliole}"
WINDOWS_CLIENT_ACTION="${WINDOWS_CLIENT_ACTION:-status}"
RUN_NODE_IN_WINDOWS_REPO="$(wslpath -w "${SCRIPT_DIR}/run-node-in-windows-repo.ps1")"

cd "${REPO_ROOT}"
echo "[windows-restart-client] action=${WINDOWS_CLIENT_ACTION}"
echo "[windows-restart-client] workdir=${WINDOWS_WORKDIR}"

RUNTIME_HEAD="${FOLIOLE_RUNTIME_HEAD:-$(git rev-parse HEAD 2>/dev/null || true)}"
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${RUN_NODE_IN_WINDOWS_REPO}" -WindowsWorkDir "${WINDOWS_WORKDIR}" -ScriptPath "scripts/windows/windows-client-native.mjs" -RuntimeHead "${RUNTIME_HEAD}" -NodeArgs "${WINDOWS_CLIENT_ACTION}"
