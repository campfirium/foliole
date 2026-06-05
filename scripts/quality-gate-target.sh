#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/quality-gate-lib.sh"

if [[ ! -f "package.json" ]]; then
  echo "[quality-gate-target] package.json not found."
  exit 1
fi

target="${1:-}"; usage="Usage: bash scripts/quality-gate-target.sh <desktop|android|android-device|shared|full|release|release-core|release-android-host> [--fail-fast]"
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

run_gate_steps_parallel() {
  local mode step log_file status_file pid exit_code failed=0 index pending now next_heartbeat heartbeat_seconds
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

  if quality_gate_should_print_step; then
    echo "[${prefix}] running in parallel: ${steps[*]}"
  fi

  for step in "${steps[@]}"; do
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
    pids+=("${pid}")
    logs+=("${log_file}")
    status_files+=("${status_file}")
    completed+=("0")
  done

  while true; do
    pending=()
    for index in "${!steps[@]}"; do
      if [[ "${completed[${index}]}" == "1" ]]; then
        continue
      fi
      if [[ -f "${status_files[${index}]}" ]]; then
        completed[${index}]="1"
        continue
      fi
      pending+=("${steps[${index}]}")
    done

    if [[ "${#pending[@]}" -eq 0 ]]; then
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
    exit_code=0
    if wait "${pids[${index}]}"; then
      exit_code=0
    else
      exit_code=$?
    fi
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

run_renderer_guards_if_present() {
  [[ ! -f "scripts/check-ui-copy-guard.mjs" ]] || run_quality_gate_script "${prefix}" "${pm}" "copy:guard"
  [[ ! -f "scripts/check-native-dialog-guard.mjs" ]] || run_quality_gate_script "${prefix}" "${pm}" "native-dialog:guard"
}

run_full_gate_steps() {
  run_renderer_guards_if_present
  run_repository_root_boundary_check_if_present
  run_gate_steps check:android-boundary
  run_gate_steps_parallel lint:full typecheck:desktop typecheck:android
  run_gate_steps test:desktop test:android test:shared test:sync-pack test:quality
  run_gate_steps_parallel build electron:compile android:web:build
  run_workspace_boundary_check_if_present
}
if quality_gate_should_print_step; then
  echo "[${prefix}] detected package manager: ${pm}"
fi

run_native_contracts_check_if_present
run_layer_dependency_boundary_check_if_present
run_settings_classification_check_if_present
run_reading_typography_check_if_present

[[ ! -f "scripts/quality-skip-lint.mjs" ]] || run_quality_gate_command "${prefix}" "quality-skip-lint" "quality skip lint" node scripts/quality-skip-lint.mjs

case "${target}" in
  desktop)
    run_renderer_guards_if_present
    run_repository_root_boundary_check_if_present
    run_gate_steps lint:desktop:full typecheck:desktop test:desktop test:quality build electron:compile
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
  full|release-core)
    run_full_gate_steps
    ;;
  release)
    run_full_gate_steps
    run_gate_steps android:sync android:host:lint android:host:test
    ;;
  release-android-host)
    run_gate_steps android:sync android:host:lint android:host:test
    ;;
  *)
    echo "[quality-gate-target] unknown target: ${target}"
    echo "${usage}"
    exit 1
    ;;
esac

finish_quality_gate_collection "${prefix}"
echo "[${prefix}] all checks passed."
