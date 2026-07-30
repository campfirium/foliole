#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/quality-gate-lib.sh"
source "${SCRIPT_DIR}/quality-gate-fast-routing.sh"
source "${SCRIPT_DIR}/quality-gate-target-parallel.sh"

if [[ ! -f "package.json" ]]; then
  echo "[quality-gate-target] package.json not found."
  exit 1
fi

target="${1:-}"; usage="Usage: bash scripts/quality/quality-gate-target.sh <desktop|android|shared|shared-static|shared-test|shared-quality-tests|shared-build|full|release|release-core|release-hosted-common|release-hosted-common-build|release-windows-core|release-static|release-tests|release-build|release-script-preview|release-base|release-windows-tail|release-android-tail|release-ios-tail|release-tooling|release-preview-recovery|release-android-host> [--fail-fast]"
QUALITY_GATE_COLLECT_FAILURES=1
case "${2:-}" in
  --fail-fast) QUALITY_GATE_COLLECT_FAILURES=0 ;;
  "") [[ -n "${target}" ]] || { echo "${usage}"; exit 1; } ;;
  *) echo "${usage}"; exit 1 ;;
esac

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

run_repository_root_boundary_check_if_present() {
  if [[ -f "scripts/check-repository-root-boundary.mjs" ]]; then
    run_quality_gate_command \
      "${prefix}" \
      "repository-root-boundary" \
      "repository root boundary" \
      node scripts/check-repository-root-boundary.mjs
  fi
}

run_native_contracts_check_if_present() {
  if has_package_script "check:native-contracts"; then
    run_quality_gate_script "${prefix}" "${pm}" "check:native-contracts"
  fi
}

run_layer_dependency_boundary_check_if_present() {
  if [[ -f "scripts/check-layer-dependency-boundary.mjs" ]]; then
    run_quality_gate_command \
      "${prefix}" \
      "layer-dependency-boundary" \
      "layer dependency boundary" \
      node scripts/check-layer-dependency-boundary.mjs
  fi
}

run_settings_classification_check_if_present() {
  if [[ -f "scripts/check-settings-classification.mjs" ]]; then
    run_quality_gate_script "${prefix}" "${pm}" "check:settings-classification"
  fi
}

run_reading_typography_check_if_present() {
  if has_package_script "check:reading-typography"; then
    run_quality_gate_script "${prefix}" "${pm}" "check:reading-typography"
  fi
}

run_gate_steps() {
  local step
  for step in "$@"; do
    run_quality_gate_script "${prefix}" "${pm}" "${step}"
  done
}

source "${SCRIPT_DIR}/quality-gate-target-steps.sh"
if quality_gate_should_print_step; then
  echo "[${prefix}] detected package manager: ${pm}"
fi

run_native_contracts_check_if_present
run_layer_dependency_boundary_check_if_present
run_settings_classification_check_if_present
run_reading_typography_check_if_present

changed_files_for_skip_lint="$(collect_changed_files)"
if [[ -f "scripts/quality/quality-skip-lint.mjs" ]] &&
  { quality_skip_lint_target_requires_full_scan "${target}" || quality_skip_lint_changed_files_match "${changed_files_for_skip_lint}"; }; then
  run_quality_gate_command "${prefix}" "quality-skip-lint" "quality skip lint" node scripts/quality/quality-skip-lint.mjs
fi

case "${target}" in
  desktop)
    run_renderer_guards_if_present
    run_repository_root_boundary_check_if_present
    run_gate_steps lint:desktop:full typecheck:desktop test:desktop test:windows:core
    run_quality_script_gate_steps_if_related "${changed_files_for_skip_lint}"
    run_gate_steps build electron:compile
    run_workspace_boundary_check_if_present
    ;;
  android)
    run_renderer_guards_if_present
    run_repository_root_boundary_check_if_present
    run_gate_steps check:android-boundary lint:android:full typecheck:android test:android
    run_quality_script_gate_steps_if_related "${changed_files_for_skip_lint}"
    run_gate_steps android:sync android:host:lint android:host:test
    ;;
  shared)
    run_shared_static_gate_steps
    run_shared_test_gate_steps
    run_quality_script_gate_steps_if_related "${changed_files_for_skip_lint}"
    run_shared_build_gate_steps
    ;;
  shared-static)
    run_shared_static_gate_steps
    ;;
  shared-test)
    run_shared_test_gate_steps
    ;;
  shared-quality-tests)
    run_shared_quality_test_gate_steps
    ;;
  shared-build)
    run_shared_build_gate_steps
    ;;
  full|release|release-core|release-hosted-common|release-hosted-common-build|release-windows-core|release-static|release-tests|release-build|release-script-preview|release-base|release-windows-tail|release-android-tail|release-ios-tail|release-tooling|release-preview-recovery|release-android-host)
    apply_release_gate_acceleration_defaults
    run_release_target_steps "${target}"
    ;;
  *)
    echo "[quality-gate-target] unknown target: ${target}"
    echo "${usage}"
    exit 1
    ;;
esac

finish_quality_gate_collection "${prefix}"
echo "[${prefix}] all checks passed."
