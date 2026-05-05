#!/usr/bin/env bash
set -euo pipefail

WINDOWS_WORKDIR="${WINDOWS_WORKDIR:-C:\\dev\\foliole}"

if ! command -v powershell.exe >/dev/null 2>&1; then
  echo "[windows-native-direct] powershell.exe not found"
  exit 1
fi

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Set-Location '${WINDOWS_WORKDIR}'; npm run tauri:dev"
