#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/quality-gate-lib.sh"
source "${SCRIPT_DIR}/quality-gate-fast-routing.sh"

if [[ ! -f "package.json" ]]; then
  echo "[quality-gate-target] package.json not found."
  exit 1
fi

target="${1:-}"; usage="Usage: bash scripts/quality-gate-target.sh <desktop|android|android-device|shared|full|release|release-core|release-static|release-tests|release-build|release-script-preview|release-base|release-windows-tail|release-android-tail|release-ios-tail|release-tooling|release-preview-recovery|release-android-host> [--fail-fast]"
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

resolve_quality_gate_parallel_max_jobs() {
  local max_jobs="${QUALITY_GATE_PARALLEL_MAX_JOBS:-4}"
  if [[ ! "${max_jobs}" =~ ^[0-9]+$ || "${max_jobs}" -le 0 ]]; then
    max_jobs=4
  fi
  printf '%s' "${max_jobs}"
}

run_gate_steps_parallel() {
  local mode step log_file status_file pid exit_code failed=0 index pending now next_heartbeat heartbeat_seconds max_jobs launched=0 active_jobs=0
  local -a steps=("$@")
  local -a pids=()
  local -a logs=()
  local -a status_files=()
  local -a completed=()

  if [[ "${#steps[@]}" -eq 0 ]]; then
    return 0
  fi

  mode="$(resolve_quality_gate_log_mode)"
  heartbeat_seconds="${QUALITY_GATE_PARALLEL_HEARTBEAT_SECONDS:-30}"
  if [[ ! "${heartbeat_seconds}" =~ ^[0-9]+$ || "${heartbeat_seconds}" -le 0 ]]; then
    heartbeat_seconds=30
  fi
  next_heartbeat=$((SECONDS + heartbeat_seconds))
  max_jobs="$(resolve_quality_gate_parallel_max_jobs)"

  if quality_gate_should_print_step; then
    echo "[${prefix}] running in parallel: ${steps[*]}"
    echo "[${prefix}] parallel max jobs: ${max_jobs}"
  fi

  while true; do
    while (( launched < ${#steps[@]} && active_jobs < max_jobs )); do
      step="${steps[${launched}]}"
      log_file="$(create_quality_gate_log_file "${step}.parallel")"
      status_file="${log_file}.status"
      : >"${log_file}"
      rm -f "${status_file}"
      (
        trap 'if [[ -n "${QUALITY_GATE_ACTIVE_PGID:-}" ]]; then terminate_process_group "${QUALITY_GATE_ACTIVE_PGID}"; fi' EXIT INT TERM
        set +e
        ( QUALITY_GATE_COLLECT_FAILURES=0 run_quality_gate_script "${prefix}" "${pm}" "${step}" ) >"${log_file}" 2>&1
        exit_code=$?
        set -e
        printf '%s\n' "${exit_code}" >"${status_file}"
        exit "${exit_code}"
      ) &
      pid=$!
      pids[${launched}]="${pid}"
      logs[${launched}]="${log_file}"
      status_files[${launched}]="${status_file}"
      completed[${launched}]="0"
      launched=$((launched + 1))
      active_jobs=$((active_jobs + 1))
    done

    pending=()
    for ((index = 0; index < launched; index += 1)); do
      if [[ "${completed[${index}]}" == "1" ]]; then
        continue
      fi
      if [[ -f "${status_files[${index}]}" ]]; then
        completed[${index}]="1"
        active_jobs=$((active_jobs - 1))
        continue
      fi
      pending+=("${steps[${index}]}")
    done

    if (( launched >= ${#steps[@]} && active_jobs == 0 )); then
      break
    fi

    now="${SECONDS}"
    if (( now >= next_heartbeat )); then
      echo "[${prefix}] still running in parallel: ${pending[*]}"
      next_heartbeat=$((now + heartbeat_seconds))
    fi
    sleep 1
  done

  for index in "${!steps[@]}"; do
    wait "${pids[${index}]}" || true
  done

  for index in "${!steps[@]}"; do
    exit_code="$(cat "${status_files[${index}]}" 2>/dev/null || printf '1')"
    if [[ "${exit_code}" -ne 0 ]]; then
      failed=1
      record_quality_gate_failure "${prefix}" "${steps[${index}]}" "${steps[${index}]}" "${logs[${index}]}" "npm run ${steps[${index}]}"
      echo "[${prefix}] ${steps[${index}]} failed:"
      echo "[${prefix}] full log: ${logs[${index}]}"
      cat "${logs[${index}]}"
    elif [[ "${mode}" == "verbose" ]]; then
      cat "${logs[${index}]}"
    elif [[ "${mode}" == "summary" ]]; then
      print_quality_gate_success_excerpt "${prefix}" "${steps[${index}]}" "${logs[${index}]}"
    fi
  done

  if [[ "${failed}" -ne 0 ]]; then
    if quality_gate_collect_failures_enabled; then
      mark_quality_gate_collected_failure
      return 0
    fi
    return 1
  fi
}

apply_release_gate_acceleration_defaults() {
  export QUALITY_GATE_PARALLEL_MAX_JOBS="${QUALITY_GATE_PARALLEL_MAX_JOBS:-4}"
  export VITEST_FILE_PARALLELISM="${VITEST_FILE_PARALLELISM:-1}"
  export VITEST_MAX_WORKERS="${VITEST_MAX_WORKERS:-4}"
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
if [[ -f "scripts/quality-skip-lint.mjs" ]] &&
  { quality_skip_lint_target_requires_full_scan "${target}" || quality_skip_lint_changed_files_match "${changed_files_for_skip_lint}"; }; then
  run_quality_gate_command "${prefix}" "quality-skip-lint" "quality skip lint" node scripts/quality-skip-lint.mjs
fi

case "${target}" in
  desktop)
    run_renderer_guards_if_present
    run_repository_root_boundary_check_if_present
    run_gate_steps lint:desktop:full typecheck:desktop test:desktop test:windows:core test:quality build electron:compile
    run_workspace_boundary_check_if_present
    ;;
  android)
    run_renderer_guards_if_present
    run_repository_root_boundary_check_if_present
    run_gate_steps check:android-boundary lint:android:full typecheck:android test:android test:quality android:sync android:host:lint android:host:test
    ;;
  android-device)
    run_renderer_guards_if_present
    run_repository_root_boundary_check_if_present
    run_gate_steps check:android-boundary lint:android:full typecheck:android test:android test:quality android:sync android:host:lint android:host:test android:emulator android:host:device-test
    ;;
  shared)
    run_renderer_guards_if_present
    run_repository_root_boundary_check_if_present
    run_gate_steps check:android-boundary lint:shared:full typecheck:shared test:shared test:quality build electron:compile android:web:build
    run_workspace_boundary_check_if_present
    ;;
  full|release|release-core|release-static|release-tests|release-build|release-script-preview|release-base|release-windows-tail|release-android-tail|release-ios-tail|release-tooling|release-preview-recovery|release-android-host)
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
