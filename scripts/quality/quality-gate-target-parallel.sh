#!/usr/bin/env bash

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
  local -a failure_recorded=()

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
      failure_recorded[${launched}]="0"
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
        exit_code="$(cat "${status_files[${index}]}" 2>/dev/null || printf '1')"
        if [[ "${exit_code}" -ne 0 && "${failure_recorded[${index}]}" != "1" ]]; then
          failure_recorded[${index}]="1"
          record_quality_gate_failure "${prefix}" "${steps[${index}]}" "${steps[${index}]}" "${logs[${index}]}" "npm run ${steps[${index}]}"
        fi
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
      if [[ "${failure_recorded[${index}]}" != "1" ]]; then
        record_quality_gate_failure "${prefix}" "${steps[${index}]}" "${steps[${index}]}" "${logs[${index}]}" "npm run ${steps[${index}]}"
      fi
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
}
