#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LOG_DIR="${REPO_ROOT}/logs/windows"
PS_SCRIPT="${SCRIPT_DIR}/run-windows-pipeline.ps1"
WINDOWS_WORKDIR="${WINDOWS_WORKDIR:-C:\\dev\\foliole}"
SKIP_TAURI_BUILD="true"

for arg in "$@"; do
  case "$arg" in
    --skip-tauri-build)
      SKIP_TAURI_BUILD="true"
      ;;
    --with-tauri-build)
      SKIP_TAURI_BUILD="false"
      ;;
    *)
      echo "[windows-pipeline] unsupported argument: ${arg}"
      exit 2
      ;;
  esac
done

if ! command -v powershell.exe >/dev/null 2>&1; then
  echo "[windows-pipeline] powershell.exe not found. Run this command inside WSL on Windows."
  exit 1
fi

if [[ ! -f "${PS_SCRIPT}" ]]; then
  echo "[windows-pipeline] missing PowerShell script: ${PS_SCRIPT}"
  exit 1
fi

DISTRO="${WSL_DISTRO_NAME:-}"
if [[ -z "${DISTRO}" ]]; then
  echo "[windows-pipeline] WSL_DISTRO_NAME is empty. Cannot resolve \\\\wsl.localhost distro name."
  exit 1
fi

mkdir -p "${LOG_DIR}"
PS_SCRIPT_WIN="$(wslpath -w "${PS_SCRIPT}")"
REPO_ROOT_WIN="$(wslpath -w "${REPO_ROOT}")"
LOG_DIR_WIN="$(wslpath -w "${LOG_DIR}")"

echo "[windows-pipeline] starting..."
echo "[windows-pipeline] distro: ${DISTRO}"
echo "[windows-pipeline] source repo (linux): ${REPO_ROOT}"
echo "[windows-pipeline] mirror workdir (windows): ${WINDOWS_WORKDIR}"
echo "[windows-pipeline] log directory: ${LOG_DIR}"
if [[ "${SKIP_TAURI_BUILD}" == "true" ]]; then
  echo "[windows-pipeline] mode: dev-check (skip tauri package build)"
else
  echo "[windows-pipeline] mode: release-check (include tauri package build)"
fi

PS_ARGS=(
  -NoProfile
  -ExecutionPolicy Bypass
  -File "${PS_SCRIPT_WIN}"
  -Distro "${DISTRO}"
  -SourceRepoLinuxPath "${REPO_ROOT}"
  -SourceRepoWindowsPath "${REPO_ROOT_WIN}"
  -WindowsWorkDir "${WINDOWS_WORKDIR}"
  -LogDir "${LOG_DIR_WIN}"
)

if [[ "${SKIP_TAURI_BUILD}" == "true" ]]; then
  PS_ARGS+=(-SkipTauriBuild)
fi

set +e
powershell.exe "${PS_ARGS[@]}"
EXIT_CODE=$?
set -e

if [[ ${EXIT_CODE} -ne 0 ]]; then
  echo "[windows-pipeline] failed (exit=${EXIT_CODE})."
  echo "[windows-pipeline] inspect logs in: ${LOG_DIR}"
  exit "${EXIT_CODE}"
fi

echo "[windows-pipeline] completed successfully."
