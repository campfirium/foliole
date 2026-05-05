#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_FINISH_COMMAND="npm run task:finish"
DEFAULT_HEARTBEAT_SECONDS=15

last_nonempty_log_line() {
  local log_file="$1"
  awk 'NF { line=$0 } END { if (line) print line }' "${log_file}" 2>/dev/null || true
}

resolve_command() {
  local override="$1"
  local fallback="$2"
  if [[ -n "${override}" ]]; then
    printf '%s' "${override}"
    return 0
  fi
  printf '%s' "${fallback}"
}

run_step() {
  local label="$1"
  local command="$2"
  local log_file heartbeat_seconds child_pid elapsed exit_code started_at finished_at last_line
  log_file="$(mktemp)"
  heartbeat_seconds="${VERIFY_PREVIEW_HEARTBEAT_SECONDS:-${DEFAULT_HEARTBEAT_SECONDS}}"
  if [[ ! "${heartbeat_seconds}" =~ ^[0-9]+$ || "${heartbeat_seconds}" -le 0 ]]; then
    heartbeat_seconds="${DEFAULT_HEARTBEAT_SECONDS}"
  fi

  echo "[verify-preview] ${label}: ${command}"
  bash -lc "${command}" > >(tee "${log_file}") 2> >(tee -a "${log_file}" >&2) &
  child_pid=$!
  elapsed=0
  started_at="$(date +%s)"

  while kill -0 "${child_pid}" 2>/dev/null; do
    sleep 1
    if kill -0 "${child_pid}" 2>/dev/null; then
      elapsed=$((elapsed + 1))
      if (( elapsed % heartbeat_seconds == 0 )); then
        last_line="$(last_nonempty_log_line "${log_file}")"
        if [[ -n "${last_line}" ]]; then
          echo "[verify-preview] waiting: ${label} still running (${elapsed}s elapsed)"
          echo "[verify-preview] last output: ${last_line}"
        else
          echo "[verify-preview] waiting: ${label} still running (${elapsed}s elapsed, no output yet)"
        fi
      fi
    fi
  done

  set +e
  wait "${child_pid}"
  exit_code=$?
  set -e
  finished_at="$(date +%s)"
  elapsed=$((finished_at - started_at))

  if [[ "${exit_code}" -ne 0 ]]; then
    echo "[verify-preview] failed: ${label} exited with code ${exit_code}"
    last_line="$(last_nonempty_log_line "${log_file}")"
    if [[ -n "${last_line}" ]]; then
      echo "[verify-preview] last output: ${last_line}"
    fi
    if grep -Fq 'exceeded memory limit' "${log_file}"; then
      echo "[verify-preview] blocked: verification hit the memory limit, so preview was skipped"
    elif grep -Fq 'exceeded timeout' "${log_file}"; then
      echo "[verify-preview] blocked: verification hit the timeout, so preview was skipped"
    elif [[ "${label}" == "step 1/2 verify" ]]; then
      echo "[verify-preview] blocked: verification did not pass, so preview was skipped"
    fi
    rm -f "${log_file}"
    return "${exit_code}"
  fi

  echo "[verify-preview] passed: ${label} (${elapsed}s)"
  rm -f "${log_file}"
}

main() {
  cd "${REPO_ROOT}"

  local validate_command
  local finish_command
  validate_command="$(resolve_command "${VERIFY_PREVIEW_VALIDATE_COMMAND:-}" "npm run quality:fast")"
  finish_command="$(resolve_command "${VERIFY_PREVIEW_FINISH_COMMAND:-}" "${DEFAULT_FINISH_COMMAND}")"

  run_step "step 1/2 verify" "${validate_command}"
  run_step "step 2/2 preview" "${finish_command}"
  echo "[verify-preview] done"
}

main "$@"
