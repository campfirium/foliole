#!/usr/bin/env bash
set -euo pipefail

DEFAULT_QUALITY_GATE_HEARTBEAT_SECONDS=15
DEFAULT_QUALITY_GATE_FAILURE_HEAD_LINES=20
DEFAULT_QUALITY_GATE_FAILURE_TAIL_LINES=120
DEFAULT_QUALITY_GATE_SUCCESS_TAIL_LINES=25
DEFAULT_QUALITY_GATE_LOG_RETENTION_RUNS=10
DEFAULT_QUALITY_GATE_TIMEOUT_SECONDS=600
DEFAULT_QUALITY_GATE_TEST_TIMEOUT_SECONDS=0
DEFAULT_ANDROID_SYNC_TIMEOUT_SECONDS=1200
DEFAULT_ANDROID_HOST_TIMEOUT_SECONDS=1200
DEFAULT_ANDROID_HOST_DEVICE_TEST_TIMEOUT_SECONDS=1800

if [[ -z "${QUALITY_GATE_RUN_ID:-}" ]]; then
  QUALITY_GATE_RUN_ID="$(date +%Y%m%d-%H%M%S)-$$"
fi
export QUALITY_GATE_RUN_ID

QUALITY_GATE_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${QUALITY_GATE_LIB_DIR}/quality-gate-log.sh"
source "${QUALITY_GATE_LIB_DIR}/quality-gate-telemetry.sh"
source "${QUALITY_GATE_LIB_DIR}/quality-gate-failure-summary.sh"
source "${QUALITY_GATE_LIB_DIR}/quality-gate-process.sh"

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
    test|test:*|check:android-boundary)
      printf '%s' "${QUALITY_GATE_TIMEOUT_SECONDS:-${DEFAULT_QUALITY_GATE_TEST_TIMEOUT_SECONDS}}"
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

run_quality_gate_command() {
  local prefix="$1"
  local script_name="$2"
  local display_name="$3"
  shift 3

  local mode
  local timeout_seconds max_rss_kb output_file exit_code rerun_command started_at_epoch ended_at_epoch duration_seconds peak_rss_kb
  mode="$(resolve_quality_gate_log_mode)"
  timeout_seconds="$(resolve_quality_gate_limit "${script_name}" timeout_seconds)"
  max_rss_kb="$(resolve_quality_gate_limit "${script_name}" max_rss_kb)"
  output_file="$(create_quality_gate_log_file "${script_name}")"
  : >"${output_file}"

  if quality_gate_should_print_step; then
    echo "[${prefix}] running: ${display_name}"
    echo "[${prefix}] limits for ${display_name}: timeout=${timeout_seconds}s, max-rss=${max_rss_kb}KiB"
  fi

  QUALITY_GATE_CURRENT_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  started_at_epoch="${SECONDS}"
  if run_command_with_limits "${prefix}" "${output_file}" "${timeout_seconds}" "${max_rss_kb}" "${display_name}" "$@"; then
    exit_code=0
  else
    exit_code=$?
  fi
  ended_at_epoch="${SECONDS}"
  duration_seconds=$((ended_at_epoch - started_at_epoch))
  peak_rss_kb="${QUALITY_GATE_LAST_PEAK_RSS_KB:-0}"
  append_quality_gate_telemetry "${prefix}" "${script_name}" "${display_name}" "${exit_code}" "${duration_seconds}" "${peak_rss_kb}" "${output_file}"
  QUALITY_GATE_CURRENT_STARTED_AT=""

  if [[ "${exit_code}" -ne 0 ]]; then
    rerun_command="$(resolve_quality_gate_rerun_command "${script_name}" "${output_file}" "$@")"
    record_quality_gate_failure "${prefix}" "${script_name}" "${display_name}" "${output_file}" "${rerun_command}"
    echo "[${prefix}] failed: ${display_name}"
    echo "[${prefix}] full log: ${output_file}"
    print_quality_gate_failure_excerpt "${prefix}" "${display_name}" "${output_file}"
    if quality_gate_collect_failures_enabled; then
      mark_quality_gate_collected_failure
      return 0
    fi
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

run_quality_gate_script() {
  local prefix="$1"
  local pm="$2"
  local script_name="$3"

  if ! has_package_script "${script_name}"; then
    echo "[${prefix}] missing script: ${script_name}"
    if quality_gate_collect_failures_enabled; then
      local missing_output_file
      missing_output_file="$(create_quality_gate_log_file "${script_name}")"
      printf '[%s] missing script: %s\n' "${prefix}" "${script_name}" >"${missing_output_file}"
      record_quality_gate_failure "${prefix}" "${script_name}" "${script_name}" "${missing_output_file}" "npm run ${script_name}"
      mark_quality_gate_collected_failure
      return 0
    fi
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
