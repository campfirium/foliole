#!/usr/bin/env bash
set -euo pipefail

resolve_package_manager() {
  local resolved_pm="npm"
  if [[ -f "pnpm-lock.yaml" ]]; then
    resolved_pm="pnpm"
  elif [[ -f "bun.lockb" || -f "bun.lock" ]]; then
    resolved_pm="bun"
  elif [[ -f "yarn.lock" ]]; then
    resolved_pm="yarn"
  fi
  printf '%s' "${resolved_pm}"
}

has_package_script() {
  local script_name="$1"
  node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts['$script_name'] ? 0 : 1)"
}

quality_gate_should_print_step() {
  [[ "${QUALITY_GATE_LOG_MODE:-verbose}" != "fail-only" ]]
}

run_quality_gate_script() {
  local prefix="$1"
  local pm="$2"
  local script_name="$3"

  if ! has_package_script "${script_name}"; then
    echo "[${prefix}] missing script: ${script_name}"
    exit 1
  fi

  local mode="${QUALITY_GATE_LOG_MODE:-verbose}"
  if [[ "${mode}" != "verbose" && "${mode}" != "summary" && "${mode}" != "fail-only" ]]; then
    echo "[${prefix}] invalid QUALITY_GATE_LOG_MODE: ${mode}"
    exit 1
  fi

  local -a command_args=()
  if [[ "${pm}" == "yarn" ]]; then
    command_args=(yarn "${script_name}")
  else
    command_args=("${pm}" run "${script_name}")
  fi

  if [[ "${mode}" == "verbose" ]]; then
    if quality_gate_should_print_step; then
      echo "[${prefix}] running: ${command_args[*]}"
    fi
    "${command_args[@]}"
    return 0
  fi

  local output_file
  output_file="$(mktemp)"
  local exit_code=0

  if quality_gate_should_print_step; then
    echo "[${prefix}] running: ${script_name}"
  fi

  set +e
  "${command_args[@]}" >"${output_file}" 2>&1
  exit_code=$?
  set -e

  if [[ "${exit_code}" -ne 0 ]]; then
    echo "[${prefix}] failed: ${script_name}"
    cat "${output_file}"
    rm -f "${output_file}"
    return "${exit_code}"
  fi

  if quality_gate_should_print_step; then
    echo "[${prefix}] passed: ${script_name}"
  fi

  rm -f "${output_file}"
}
