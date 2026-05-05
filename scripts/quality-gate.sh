#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/quality-gate-lib.sh"

if [[ ! -f "package.json" ]]; then
  echo "[quality-gate] package.json not found."
  echo "[quality-gate] Create project baseline first (lint/typecheck/test/build scripts)."
  exit 1
fi

pm="$(resolve_package_manager)"

if quality_gate_should_print_step; then
  echo "[quality-gate] detected package manager: ${pm}"
fi
run_quality_gate_script "quality-gate" "${pm}" "lint"
run_quality_gate_script "quality-gate" "${pm}" "typecheck"
if [[ -f "scripts/check-workspace-settings-boundary.mjs" ]]; then
  node scripts/check-workspace-settings-boundary.mjs
fi
run_quality_gate_script "quality-gate" "${pm}" "test"
run_quality_gate_script "quality-gate" "${pm}" "build"

echo "[quality-gate] all checks passed."
