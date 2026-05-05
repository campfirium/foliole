#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WINDOWS_SYNC_SCRIPT="${WINDOWS_SYNC_SCRIPT:-scripts/windows/windows-sync.sh}"
WINDOWS_SMOKE_CONFIG="${WINDOWS_SMOKE_CONFIG:-playwright.desktop.config.ts}"
WINDOWS_SMOKE_SPEC="${WINDOWS_SMOKE_SPEC:-tests/desktop/startup-settings-backups.smoke.spec.ts}"
WINDOWS_SMOKE_RUNNER="${WINDOWS_SMOKE_RUNNER:-}"
WINDOWS_SMOKE_SKIP_SYNC="${WINDOWS_SMOKE_SKIP_SYNC:-0}"

cd "${REPO_ROOT}"

detect_package_manager() {
  if [[ -f "pnpm-lock.yaml" ]]; then
    printf 'pnpm'
    return 0
  fi
  if [[ -f "bun.lockb" || -f "bun.lock" ]]; then
    printf 'bun'
    return 0
  fi
  if [[ -f "yarn.lock" ]]; then
    printf 'yarn'
    return 0
  fi
  printf 'npm'
}

run_windows_smoke() {
  if [ -n "${WINDOWS_SMOKE_RUNNER}" ]; then
    bash -lc "${WINDOWS_SMOKE_RUNNER}"
    return 0
  fi

  local pm=""
  pm="$(detect_package_manager)"

  if [ "${pm}" = "yarn" ]; then
    yarn test:e2e --config "${WINDOWS_SMOKE_CONFIG}" "${WINDOWS_SMOKE_SPEC}"
    return 0
  fi

  "${pm}" run test:e2e -- --config "${WINDOWS_SMOKE_CONFIG}" "${WINDOWS_SMOKE_SPEC}"
}

if [ "${WINDOWS_SMOKE_SKIP_SYNC}" != "1" ]; then
  echo "[windows-smoke] step 1/2: sync to windows mirror"
  bash "${WINDOWS_SYNC_SCRIPT}"
else
  echo "[windows-smoke] step 1/2: reuse existing windows mirror sync"
fi

echo "[windows-smoke] step 2/2: run desktop smoke"
run_windows_smoke

echo "[windows-smoke] status: PASSED"
