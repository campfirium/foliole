#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PS_SCRIPT="${SCRIPT_DIR}/run-tauri-stable.ps1"
WINDOWS_WORKDIR="${WINDOWS_WORKDIR:-C:\\dev\\foliole}"

if ! command -v powershell.exe >/dev/null 2>&1; then
  echo "[windows-tauri-stable] powershell.exe not found. Run this command inside WSL on Windows."
  exit 1
fi

if [[ ! -f "${PS_SCRIPT}" ]]; then
  echo "[windows-tauri-stable] missing PowerShell script: ${PS_SCRIPT}"
  exit 1
fi

PS_SCRIPT_WIN="$(wslpath -w "${PS_SCRIPT}")"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${PS_SCRIPT_WIN}" -WindowsWorkDir "${WINDOWS_WORKDIR}"
