#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LOG_DIR="${REPO_ROOT}/logs/windows"
PS_SCRIPT="${SCRIPT_DIR}/run-windows-native-dev.ps1"
WINDOWS_WORKDIR="${WINDOWS_WORKDIR:-C:\\dev\\foliole}"
ACTION="${1:-apply}"
RESOLVED_ACTION="${ACTION}"

case "${ACTION}" in
  start|sync|restart|stop|status|apply)
    ;;
  *)
    echo "[windows-native-dev] unsupported action: ${ACTION}"
    echo "[windows-native-dev] usage: bash scripts/windows/windows-sync-launch-native-dev.sh [start|sync|restart|stop|status|apply]"
    exit 2
    ;;
esac

if [[ "${ACTION}" == "apply" ]]; then
  changed_files=""
  if git -C "${REPO_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    tracked_changes="$(git -C "${REPO_ROOT}" diff --name-only HEAD || true)"
    untracked_changes="$(git -C "${REPO_ROOT}" ls-files --others --exclude-standard || true)"
    changed_files="$(printf "%s\n%s\n" "${tracked_changes}" "${untracked_changes}" | sed '/^$/d' | sort -u)"
  fi

  # Always sync only. The running `tauri dev` process on Windows watches for
  # file changes itself and handles hot-reload (frontend) or recompile+restart
  # (Rust) automatically. Forcing a restart from WSL kills WebView2 mid-flight
  # and causes UDD lock corruption. Let Tauri CLI own the restart decision.
  RESOLVED_ACTION="sync"

  echo "[windows-native-dev] apply decision: ${RESOLVED_ACTION}"
fi

if ! command -v powershell.exe >/dev/null 2>&1; then
  echo "[windows-native-dev] powershell.exe not found. Run this command inside WSL on Windows."
  exit 1
fi

if [[ ! -f "${PS_SCRIPT}" ]]; then
  echo "[windows-native-dev] missing PowerShell script: ${PS_SCRIPT}"
  exit 1
fi

DISTRO="${WSL_DISTRO_NAME:-}"
if [[ -z "${DISTRO}" ]]; then
  echo "[windows-native-dev] WSL_DISTRO_NAME is empty. Cannot resolve \\\\wsl.localhost distro name."
  exit 1
fi

mkdir -p "${LOG_DIR}"
PS_SCRIPT_WIN="$(wslpath -w "${PS_SCRIPT}")"
REPO_ROOT_WIN="$(wslpath -w "${REPO_ROOT}")"
LOG_DIR_WIN="$(wslpath -w "${LOG_DIR}")"

echo "[windows-native-dev] action: ${ACTION}"
echo "[windows-native-dev] resolved action: ${RESOLVED_ACTION}"
echo "[windows-native-dev] distro: ${DISTRO}"
echo "[windows-native-dev] source repo (linux): ${REPO_ROOT}"
echo "[windows-native-dev] mirror workdir (windows): ${WINDOWS_WORKDIR}"
echo "[windows-native-dev] log directory: ${LOG_DIR}"

PS_ARGS=(
  -NoProfile
  -ExecutionPolicy Bypass
  -File "${PS_SCRIPT_WIN}"
  -Distro "${DISTRO}"
  -SourceRepoLinuxPath "${REPO_ROOT}"
  -SourceRepoWindowsPath "${REPO_ROOT_WIN}"
  -WindowsWorkDir "${WINDOWS_WORKDIR}"
  -LogDir "${LOG_DIR_WIN}"
  -Action "${RESOLVED_ACTION}"
)

set +e
powershell.exe "${PS_ARGS[@]}"
EXIT_CODE=$?
set -e

if [[ ${EXIT_CODE} -ne 0 ]]; then
  echo "[windows-native-dev] failed (exit=${EXIT_CODE})."
  echo "[windows-native-dev] inspect logs in: ${LOG_DIR}"
  exit "${EXIT_CODE}"
fi

echo "[windows-native-dev] action completed."
