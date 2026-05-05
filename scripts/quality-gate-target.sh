#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/quality-gate-lib.sh"

if [[ ! -f "package.json" ]]; then
  echo "[quality-gate-target] package.json not found."
  exit 1
fi

target="${1:-}"
if [[ -z "${target}" ]]; then
  echo "Usage: bash scripts/quality-gate-target.sh <desktop|android|android-device|shared|full>"
  exit 1
fi

pm="$(resolve_package_manager)"
prefix="quality-gate:${target}"

run_workspace_boundary_check_if_present() {
  if [[ -f "scripts/check-workspace-settings-boundary.mjs" ]]; then
    run_quality_gate_command \
      "${prefix}" \
      "workspace-settings-boundary" \
      "workspace settings boundary" \
      node scripts/check-workspace-settings-boundary.mjs
  fi
}

run_gate_steps() {
  local step
  for step in "$@"; do
    run_quality_gate_script "${prefix}" "${pm}" "${step}"
  done
}

if quality_gate_should_print_step; then
  echo "[${prefix}] detected package manager: ${pm}"
fi

case "${target}" in
  desktop)
    run_gate_steps lint:desktop typecheck:desktop test:desktop build electron:compile
    run_workspace_boundary_check_if_present
    ;;
  android)
    run_gate_steps lint:android typecheck:android test:android android:sync android:host:lint android:host:test
    ;;
  android-device)
    run_gate_steps lint:android typecheck:android test:android android:sync android:host:lint android:host:test android:emulator android:host:device-test
    ;;
  shared)
    run_gate_steps lint:shared typecheck:shared test:shared build electron:compile android:web:build
    run_workspace_boundary_check_if_present
    ;;
  full)
    run_gate_steps lint typecheck test build electron:compile android:sync android:host:lint android:host:test
    run_workspace_boundary_check_if_present
    ;;
  *)
    echo "[quality-gate-target] unknown target: ${target}"
    echo "Usage: bash scripts/quality-gate-target.sh <desktop|android|android-device|shared|full>"
    exit 1
    ;;
esac

echo "[${prefix}] all checks passed."
