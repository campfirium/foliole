#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/quality-gate-lib.sh"

if [[ ! -f "package.json" ]]; then
  echo "[quality-gate-fast] package.json not found."
  exit 1
fi

pm="$(resolve_package_manager)"

if quality_gate_should_print_step; then
  echo "[quality-gate-fast] detected package manager: ${pm}"
fi
run_quality_gate_script "quality-gate-fast" "${pm}" "lint"
run_quality_gate_script "quality-gate-fast" "${pm}" "typecheck"
run_quality_gate_script "quality-gate-fast" "${pm}" "test"

echo "[quality-gate-fast] all checks passed."
