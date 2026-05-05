#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LOG_DIR="${REPO_ROOT}/logs/windows"
PS_SCRIPT="${SCRIPT_DIR}/check-windows-env.ps1"

if ! command -v powershell.exe >/dev/null 2>&1; then
  echo "[windows-env-check] powershell.exe not found. Run this command inside WSL on Windows."
  exit 1
fi

if [[ ! -f "${PS_SCRIPT}" ]]; then
  echo "[windows-env-check] missing PowerShell script: ${PS_SCRIPT}"
  exit 1
fi

mkdir -p "${LOG_DIR}"
PS_SCRIPT_WIN="$(wslpath -w "${PS_SCRIPT}")"
LOG_DIR_WIN="$(wslpath -w "${LOG_DIR}")"

echo "[windows-env-check] running Windows prerequisite checks..."
echo "[windows-env-check] log directory: ${LOG_DIR}"

set +e
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${PS_SCRIPT_WIN}" -LogDir "${LOG_DIR_WIN}"
EXIT_CODE=$?
set -e

if [[ ${EXIT_CODE} -ne 0 ]]; then
  echo "[windows-env-check] failed (exit=${EXIT_CODE})."
  echo "[windows-env-check] inspect latest log in: ${LOG_DIR}"
  exit "${EXIT_CODE}"
fi

echo "[windows-env-check] completed successfully."
