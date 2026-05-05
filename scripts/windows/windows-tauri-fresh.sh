#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PS_SCRIPT="${SCRIPT_DIR}/run-tauri-fresh.ps1"

if ! command -v powershell.exe >/dev/null 2>&1; then
  echo "[windows-tauri-fresh] powershell.exe not found."
  exit 1
fi

if [[ ! -f "${PS_SCRIPT}" ]]; then
  echo "[windows-tauri-fresh] missing PowerShell script: ${PS_SCRIPT}"
  exit 1
fi

PS_SCRIPT_WIN="$(wslpath -w "${PS_SCRIPT}")"
ARGS=()
if [[ "${1:-}" == "diag" ]]; then
  ARGS+=(-DiagSolid)
fi
if [[ "${1:-}" == "sw" ]]; then
  ARGS+=(-SoftwareOnly)
fi
if [[ "${1:-}" == "diag-sw" ]]; then
  ARGS+=(-DiagSolid -SoftwareOnly)
fi

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${PS_SCRIPT_WIN}" "${ARGS[@]}"
