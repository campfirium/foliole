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
  echo "Usage: bash scripts/quality-gate-target.sh <desktop|android|android-device|shared|full|release>"
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

run_repository_root_boundary_check_if_present() {
  if [[ -f "scripts/check-repository-root-boundary.mjs" ]]; then
    run_quality_gate_command \
      "${prefix}" \
      "repository-root-boundary" \
      "repository root boundary" \
      node scripts/check-repository-root-boundary.mjs
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

package_script_exists() {
  node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts[process.argv[1]] ? 0 : 1)" "$1"
}

run_android_boundary_check_if_present() {
  if package_script_exists "check:android-boundary"; then
    run_quality_gate_script "${prefix}" "${pm}" "check:android-boundary"
  fi
}

run_gate_steps() {
  local step
  for step in "$@"; do
    run_quality_gate_script "${prefix}" "${pm}" "${step}"
  done
}

run_gate_steps_parallel() {
  local mode step log_file status_file pid exit_code failed index pending now next_heartbeat heartbeat_seconds
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
      ( run_quality_gate_script "${prefix}" "${pm}" "${step}" ) >"${log_file}" 2>&1
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

  failed=0
  for index in "${!steps[@]}"; do
    exit_code="$(cat "${status_files[${index}]}" 2>/dev/null || printf '1')"
    if [[ "${exit_code}" -ne 0 ]]; then
      failed=1
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
    return 1
  fi
}

run_copy_guard_if_present() {
  if [[ -f "scripts/check-ui-copy-guard.mjs" ]]; then
    run_quality_gate_script "${prefix}" "${pm}" "copy:guard"
  fi
}

if quality_gate_should_print_step; then
  echo "[${prefix}] detected package manager: ${pm}"
fi

run_layer_dependency_boundary_check_if_present

case "${target}" in
  desktop)
    run_copy_guard_if_present
    run_repository_root_boundary_check_if_present
    run_gate_steps lint:desktop typecheck:desktop test:desktop build electron:compile
    run_workspace_boundary_check_if_present
    ;;
  android)
    run_copy_guard_if_present
    run_repository_root_boundary_check_if_present
    run_android_boundary_check_if_present
    run_gate_steps lint:android typecheck:android test:android android:sync android:host:lint android:host:test
    ;;
  android-device)
    run_copy_guard_if_present
    run_repository_root_boundary_check_if_present
    run_android_boundary_check_if_present
    run_gate_steps lint:android typecheck:android test:android android:sync android:host:lint android:host:test android:emulator android:host:device-test
    ;;
  shared)
    run_copy_guard_if_present
    run_repository_root_boundary_check_if_present
    run_android_boundary_check_if_present
    run_gate_steps lint:shared typecheck:shared test:shared build electron:compile android:web:build
    run_workspace_boundary_check_if_present
    ;;
  full)
    run_copy_guard_if_present
    run_repository_root_boundary_check_if_present
    run_android_boundary_check_if_present
    run_gate_steps lint typecheck:desktop typecheck:android test:full
    run_gate_steps_parallel build electron:compile android:web:build
    run_workspace_boundary_check_if_present
    ;;
  release)
    run_copy_guard_if_present
    run_repository_root_boundary_check_if_present
    run_android_boundary_check_if_present
    run_gate_steps lint typecheck:desktop typecheck:android test:full
    run_gate_steps_parallel build electron:compile android:web:build
    run_gate_steps android:sync android:host:lint android:host:test
    run_workspace_boundary_check_if_present
    ;;
  *)
    echo "[quality-gate-target] unknown target: ${target}"
    echo "Usage: bash scripts/quality-gate-target.sh <desktop|android|android-device|shared|full|release>"
    exit 1
    ;;
esac

echo "[${prefix}] all checks passed."
