#!/usr/bin/env bash
set -euo pipefail

DEFAULT_QUALITY_GATE_HEARTBEAT_SECONDS=15
DEFAULT_QUALITY_GATE_FAILURE_HEAD_LINES=20
DEFAULT_QUALITY_GATE_FAILURE_TAIL_LINES=120
DEFAULT_QUALITY_GATE_SUCCESS_TAIL_LINES=25
DEFAULT_QUALITY_GATE_LOG_RETENTION_RUNS=10
DEFAULT_QUALITY_GATE_TIMEOUT_SECONDS=600
DEFAULT_FULL_TEST_TIMEOUT_SECONDS=1200
DEFAULT_ANDROID_SYNC_TIMEOUT_SECONDS=1200
DEFAULT_ANDROID_HOST_TIMEOUT_SECONDS=1200
DEFAULT_ANDROID_HOST_DEVICE_TEST_TIMEOUT_SECONDS=1800

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

resolve_quality_gate_log_mode() {
  printf '%s' "${QUALITY_GATE_LOG_MODE:-fail-only}"
}

quality_gate_should_print_step() {
  [[ "$(resolve_quality_gate_log_mode)" != "fail-only" ]]
}

resolve_quality_gate_heartbeat_seconds() {
  local heartbeat_seconds="${QUALITY_GATE_HEARTBEAT_SECONDS:-${DEFAULT_QUALITY_GATE_HEARTBEAT_SECONDS}}"
  if [[ ! "${heartbeat_seconds}" =~ ^[0-9]+$ || "${heartbeat_seconds}" -le 0 ]]; then
    heartbeat_seconds="${DEFAULT_QUALITY_GATE_HEARTBEAT_SECONDS}"
  fi
  printf '%s' "${heartbeat_seconds}"
}

resolve_quality_gate_excerpt_lines() {
  local value="$1"
  local fallback="$2"

  if [[ ! "${value}" =~ ^[0-9]+$ || "${value}" -lt 0 ]]; then
    printf '%s' "${fallback}"
    return 0
  fi

  printf '%s' "${value}"
}

resolve_quality_gate_log_retention_runs() {
  local retention_runs="${QUALITY_GATE_LOG_RETENTION_RUNS:-${DEFAULT_QUALITY_GATE_LOG_RETENTION_RUNS}}"
  if [[ ! "${retention_runs}" =~ ^[0-9]+$ ]]; then
    retention_runs="${DEFAULT_QUALITY_GATE_LOG_RETENTION_RUNS}"
  fi
  printf '%s' "${retention_runs}"
}

sanitize_quality_gate_log_name() {
  local value="$1"
  value="${value//:/_}"
  value="${value// /-}"
  value="${value//\//_}"
  printf '%s' "${value}"
}

resolve_quality_gate_log_root() {
  local root_dir="${QUALITY_GATE_LOG_ROOT:-.tmp/logs/quality-gate}"
  mkdir -p "${root_dir}"
  (
    cd "${root_dir}" >/dev/null 2>&1
    pwd -P
  )
}

ensure_quality_gate_run_dir() {
  if [[ -n "${QUALITY_GATE_RUN_DIR:-}" ]]; then
    return 0
  fi

  local log_root run_id
  log_root="$(resolve_quality_gate_log_root)"
  run_id="${QUALITY_GATE_RUN_ID:-$(date +%Y%m%d-%H%M%S)-$$}"
  QUALITY_GATE_RUN_DIR="${log_root}/${run_id}"
  mkdir -p "${QUALITY_GATE_RUN_DIR}"
  prune_quality_gate_logs "${log_root}" "${run_id}"
}

prune_quality_gate_logs() {
  local log_root="$1"
  local active_run_id="$2"
  local retention_runs run_ids stale_run

  retention_runs="$(resolve_quality_gate_log_retention_runs)"
  if (( retention_runs <= 0 )); then
    return 0
  fi

  mapfile -t run_ids < <(
    find "${log_root}" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | sort -r
  )

  local kept_runs=0
  for stale_run in "${run_ids[@]}"; do
    [[ -z "${stale_run}" ]] && continue
    if [[ "${stale_run}" == "${active_run_id}" ]]; then
      kept_runs=$((kept_runs + 1))
      continue
    fi
    if (( kept_runs < retention_runs )); then
      kept_runs=$((kept_runs + 1))
      continue
    fi
    rm -rf "${log_root}/${stale_run}"
  done
}

create_quality_gate_log_file() {
  local script_name="$1"
  local run_dir file_name
  ensure_quality_gate_run_dir
  run_dir="${QUALITY_GATE_RUN_DIR}"
  file_name="$(sanitize_quality_gate_log_name "${script_name}").log"
  printf '%s/%s' "${run_dir}" "${file_name}"
}

create_quality_gate_failed_file() {
  ensure_quality_gate_run_dir
  printf '%s/failed.txt' "${QUALITY_GATE_RUN_DIR}"
}

terminate_process_group() {
  local pgid="$1"

  if [[ -z "${pgid}" ]]; then
    return 0
  fi

  kill -TERM -- "-${pgid}" 2>/dev/null || true
  sleep 1
  kill -KILL -- "-${pgid}" 2>/dev/null || true
}

sum_process_group_rss_kb() {
  local pgid="$1"

  if [[ -z "${pgid}" ]]; then
    printf '0'
    return 0
  fi

  ps -o rss= -g "${pgid}" 2>/dev/null | awk '{sum += $1} END {printf "%d", sum + 0}'
}

run_command_with_limits() {
  local prefix="$1"
  local output_file="$2"
  local timeout_seconds="$3"
  local max_rss_kb="$4"
  local command_label="$5"
  shift 5

  if [[ "$#" -eq 0 ]]; then
    echo "[${prefix}] missing guarded command"
    return 1
  fi

  setsid "$@" >"${output_file}" 2>&1 &
  local child_pid=$!
  local child_pgid="${child_pid}"
  QUALITY_GATE_ACTIVE_PGID="${child_pgid}"
  local started_at heartbeat_seconds
  started_at="$(date +%s)"
  heartbeat_seconds="$(resolve_quality_gate_heartbeat_seconds)"
  local peak_rss_kb=0

  while kill -0 "${child_pid}" 2>/dev/null; do
    local now elapsed current_rss_kb
    now="$(date +%s)"
    elapsed=$((now - started_at))
    current_rss_kb="$(sum_process_group_rss_kb "${child_pgid}")"

    if (( current_rss_kb > peak_rss_kb )); then
      peak_rss_kb="${current_rss_kb}"
    fi

    if (( elapsed > 0 && elapsed % heartbeat_seconds == 0 )); then
      echo "[${prefix}] waiting: ${command_label} still running (${elapsed}s elapsed, peak ${command_label} memory ${peak_rss_kb} KiB)"
    fi

    if (( max_rss_kb > 0 && current_rss_kb > max_rss_kb )); then
      echo "[${prefix}] failed: ${command_label} exceeded memory limit (${current_rss_kb} KiB > ${max_rss_kb} KiB)"
      echo "[${prefix}] stalled after: ${elapsed}s"
      echo "[${prefix}] peak ${command_label} memory: ${peak_rss_kb} KiB"
      terminate_process_group "${child_pgid}"
      QUALITY_GATE_ACTIVE_PGID=""
      wait "${child_pid}" 2>/dev/null || true
      return 1
    fi

    if (( timeout_seconds > 0 && elapsed >= timeout_seconds )); then
      echo "[${prefix}] failed: ${command_label} exceeded timeout (${timeout_seconds}s)"
      echo "[${prefix}] stalled after: ${elapsed}s"
      echo "[${prefix}] peak ${command_label} memory: ${peak_rss_kb} KiB"
      terminate_process_group "${child_pgid}"
      QUALITY_GATE_ACTIVE_PGID=""
      wait "${child_pid}" 2>/dev/null || true
      return 1
    fi

    sleep 1
  done

  local exit_code=0
  if wait "${child_pid}"; then
    exit_code=0
  else
    exit_code=$?
  fi

  if [[ "${exit_code}" -ne 0 ]]; then
    echo "[${prefix}] peak ${command_label} memory: ${peak_rss_kb} KiB"
  fi

  QUALITY_GATE_ACTIVE_PGID=""

  return "${exit_code}"
}

resolve_quality_gate_limit() {
  local script_name="$1"
  local metric="$2"
  local normalized env_name fallback

  normalized="$(printf '%s' "${script_name}" | tr '[:lower:]-:' '[:upper:]__')"
  case "${metric}" in
    timeout_seconds)
      env_name="QUALITY_GATE_${normalized}_TIMEOUT_SECONDS"
      fallback="$(resolve_quality_gate_timeout_fallback "${script_name}")"
      ;;
    max_rss_kb)
      env_name="QUALITY_GATE_${normalized}_MAX_RSS_KB"
      fallback="${QUALITY_GATE_MAX_RSS_KB:-2097152}"
      ;;
    *)
      echo "unknown quality gate limit: ${metric}" >&2
      return 1
      ;;
  esac

  printf '%s' "${!env_name:-${fallback}}"
}

resolve_quality_gate_timeout_fallback() {
  local script_name="$1"
  case "${script_name}" in
    android:sync)
      printf '%s' "${QUALITY_GATE_TIMEOUT_SECONDS:-${DEFAULT_ANDROID_SYNC_TIMEOUT_SECONDS}}"
      ;;
    android:host:device-test)
      printf '%s' "${QUALITY_GATE_TIMEOUT_SECONDS:-${DEFAULT_ANDROID_HOST_DEVICE_TEST_TIMEOUT_SECONDS}}"
      ;;
    android:host:lint|android:host:test)
      printf '%s' "${QUALITY_GATE_TIMEOUT_SECONDS:-${DEFAULT_ANDROID_HOST_TIMEOUT_SECONDS}}"
      ;;
    test:full)
      printf '%s' "${QUALITY_GATE_TIMEOUT_SECONDS:-${DEFAULT_FULL_TEST_TIMEOUT_SECONDS}}"
      ;;
    *)
      printf '%s' "${QUALITY_GATE_TIMEOUT_SECONDS:-${DEFAULT_QUALITY_GATE_TIMEOUT_SECONDS}}"
      ;;
  esac
}

quote_quality_gate_command() {
  local arg quoted=()
  for arg in "$@"; do
    printf -v arg '%q' "${arg}"
    quoted+=("${arg}")
  done
  printf '%s' "${quoted[*]}"
}

collect_failed_test_files() {
  local output_file="$1"
  grep -Eo '([[:alnum:]_./-]+\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs))' "${output_file}" 2>/dev/null | sort -u || true
}

resolve_quality_gate_rerun_command() {
  local script_name="$1"
  local output_file="$2"
  shift 2

  local failed_tests command_text
  command_text="$(quote_quality_gate_command "$@")"

  if [[ "${script_name}" == test* ]]; then
    failed_tests="$(collect_failed_test_files "${output_file}")"
    if [[ -n "${failed_tests}" ]]; then
      local -a failed_test_array
      mapfile -t failed_test_array <<< "${failed_tests}"
      printf 'npx vitest run --reporter=dot --silent=passed-only --pool=threads --maxWorkers=2'
      printf ' %q' "${failed_test_array[@]}"
      return 0
    fi
  fi

  printf '%s' "${command_text}"
}

record_quality_gate_failure() {
  local prefix="$1"
  local script_name="$2"
  local display_name="$3"
  local output_file="$4"
  local rerun_command="$5"
  local failed_file failed_tests

  failed_file="$(create_quality_gate_failed_file)"
  {
    printf 'script=%s\n' "${script_name}"
    printf 'display=%s\n' "${display_name}"
    printf 'log=%s\n' "${output_file}"
    printf 'rerun=%s\n' "${rerun_command}"
    failed_tests="$(collect_failed_test_files "${output_file}")"
    if [[ -n "${failed_tests}" ]]; then
      while IFS= read -r failed_test; do
        [[ -z "${failed_test}" ]] && continue
        printf 'failed-test=%s\n' "${failed_test}"
      done <<< "${failed_tests}"
    fi
    printf '\n'
  } >>"${failed_file}"

  echo "[${prefix}] failed summary: ${failed_file}"
  echo "[${prefix}] rerun: ${rerun_command}"
}

run_quality_gate_command() {
  local prefix="$1"
  local script_name="$2"
  local display_name="$3"
  shift 3

  local mode
  local timeout_seconds max_rss_kb output_file exit_code rerun_command
  mode="$(resolve_quality_gate_log_mode)"
  timeout_seconds="$(resolve_quality_gate_limit "${script_name}" timeout_seconds)"
  max_rss_kb="$(resolve_quality_gate_limit "${script_name}" max_rss_kb)"
  output_file="$(create_quality_gate_log_file "${script_name}")"
  : >"${output_file}"

  if quality_gate_should_print_step; then
    echo "[${prefix}] running: ${display_name}"
    echo "[${prefix}] limits for ${display_name}: timeout=${timeout_seconds}s, max-rss=${max_rss_kb}KiB"
  fi

  if run_command_with_limits "${prefix}" "${output_file}" "${timeout_seconds}" "${max_rss_kb}" "${display_name}" "$@"; then
    exit_code=0
  else
    exit_code=$?
  fi

  if [[ "${exit_code}" -ne 0 ]]; then
    rerun_command="$(resolve_quality_gate_rerun_command "${script_name}" "${output_file}" "$@")"
    record_quality_gate_failure "${prefix}" "${script_name}" "${display_name}" "${output_file}" "${rerun_command}"
    echo "[${prefix}] failed: ${display_name}"
    echo "[${prefix}] full log: ${output_file}"
    print_quality_gate_failure_excerpt "${prefix}" "${display_name}" "${output_file}"
    return "${exit_code}"
  fi

  if [[ "${mode}" == "verbose" ]]; then
    cat "${output_file}"
  elif [[ "${mode}" == "summary" ]]; then
    print_quality_gate_success_excerpt "${prefix}" "${display_name}" "${output_file}"
  fi

  if quality_gate_should_print_step; then
    echo "[${prefix}] passed: ${display_name}"
  fi
}

print_quality_gate_success_excerpt() {
  local prefix="$1"
  local display_name="$2"
  local output_file="$3"
  local total_lines tail_lines

  total_lines="$(wc -l <"${output_file}" | tr -d ' ')"
  if (( total_lines == 0 )); then
    return 0
  fi

  tail_lines="$(resolve_quality_gate_excerpt_lines "${QUALITY_GATE_SUCCESS_TAIL_LINES:-${DEFAULT_QUALITY_GATE_SUCCESS_TAIL_LINES}}" "${DEFAULT_QUALITY_GATE_SUCCESS_TAIL_LINES}")"
  if (( total_lines <= tail_lines )); then
    cat "${output_file}"
    return 0
  fi

  echo "[${prefix}] showing last ${tail_lines} lines for ${display_name} (${total_lines} total lines)"
  tail -n "${tail_lines}" "${output_file}"
}

print_quality_gate_failure_excerpt() {
  local prefix="$1"
  local display_name="$2"
  local output_file="$3"
  local total_lines head_lines tail_lines

  total_lines="$(wc -l <"${output_file}" | tr -d ' ')"
  head_lines="$(resolve_quality_gate_excerpt_lines "${QUALITY_GATE_FAILURE_HEAD_LINES:-${DEFAULT_QUALITY_GATE_FAILURE_HEAD_LINES}}" "${DEFAULT_QUALITY_GATE_FAILURE_HEAD_LINES}")"
  tail_lines="$(resolve_quality_gate_excerpt_lines "${QUALITY_GATE_FAILURE_TAIL_LINES:-${DEFAULT_QUALITY_GATE_FAILURE_TAIL_LINES}}" "${DEFAULT_QUALITY_GATE_FAILURE_TAIL_LINES}")"

  if (( total_lines <= head_lines + tail_lines + 1 )); then
    cat "${output_file}"
    return 0
  fi

  echo "[${prefix}] showing first ${head_lines} and last ${tail_lines} lines for ${display_name} (${total_lines} total lines)"
  sed -n "1,${head_lines}p" "${output_file}"
  echo "[${prefix}] ... output trimmed ..."
  tail -n "${tail_lines}" "${output_file}"
}

run_quality_gate_script() {
  local prefix="$1"
  local pm="$2"
  local script_name="$3"

  if ! has_package_script "${script_name}"; then
    echo "[${prefix}] missing script: ${script_name}"
    exit 1
  fi

  local mode
  mode="$(resolve_quality_gate_log_mode)"
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

  run_quality_gate_command "${prefix}" "${script_name}" "${script_name}" "${command_args[@]}"
}
