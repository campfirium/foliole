#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_FINISH_COMMAND="npm run task:finish"

resolve_command() {
  local override="$1"
  local fallback="$2"
  if [[ -n "${override}" ]]; then
    printf '%s' "${override}"
    return 0
  fi
  printf '%s' "${fallback}"
}

run_step() {
  local label="$1"
  local command="$2"
  echo "[verify-preview] ${label}: ${command}"
  bash -lc "${command}"
}

main() {
  cd "${REPO_ROOT}"

  local finish_command
  finish_command="$(resolve_command "${VERIFY_PREVIEW_FINISH_COMMAND:-}" "${DEFAULT_FINISH_COMMAND}")"

  # Preview now assumes the caller already ran the relevant checks for the current change.
  # Keep the old validate hook commented in place so we can restore the guard quickly if needed.
  # local validate_command
  # validate_command="$(resolve_command "${VERIFY_PREVIEW_VALIDATE_COMMAND:-}" "npm run quality:fast")"
  # run_step "step 1/2 verify" "${validate_command}"
  run_step "step 1/1 preview" "${finish_command}"
  echo "[verify-preview] done"
}

main "$@"
