#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WINDOWS_SYNC_SCRIPT="${WINDOWS_SYNC_SCRIPT:-scripts/windows/windows-sync.sh}"
WINDOWS_CLIENT_SCRIPT="${WINDOWS_CLIENT_SCRIPT:-scripts/windows/windows-restart-client.sh}"
WINDOWS_PREVIEW_TIMEOUT_SECONDS="${WINDOWS_PREVIEW_TIMEOUT_SECONDS:-25}"
WINDOWS_PREVIEW_TIMEOUT_STATUS_SECONDS="${WINDOWS_PREVIEW_TIMEOUT_STATUS_SECONDS:-${WINDOWS_PREVIEW_TIMEOUT_SECONDS}}"
WINDOWS_PREVIEW_TIMEOUT_START_SECONDS="${WINDOWS_PREVIEW_TIMEOUT_START_SECONDS:-180}"
WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS="${WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS:-180}"
WINDOWS_PREVIEW_TIMEOUT_STOP_SECONDS="${WINDOWS_PREVIEW_TIMEOUT_STOP_SECONDS:-60}"
WINDOWS_PREVIEW_ELECTRON_RESTART_MODE="${WINDOWS_PREVIEW_ELECTRON_RESTART_MODE:-full}"

cd "${REPO_ROOT}"

resolve_current_head() {
  if [ -n "${WINDOWS_PREVIEW_CURRENT_HEAD:-}" ]; then
    printf '%s' "${WINDOWS_PREVIEW_CURRENT_HEAD}"
    return 0
  fi
  git rev-parse HEAD 2>/dev/null || true
}

extract_runtime_head() {
  printf '%s\n' "$1" | sed -n 's/.* head=\([^[:space:]]*\).*/\1/p' | head -n 1
}

has_committed_electron_changes_since() {
  local runtime_head="$1"
  if [ -n "${WINDOWS_PREVIEW_COMMITTED_ELECTRON_CHANGES:-}" ]; then
    [ -n "${WINDOWS_PREVIEW_COMMITTED_ELECTRON_CHANGES}" ]
    return
  fi
  if [ -z "${runtime_head}" ] || [ -z "${CURRENT_HEAD}" ]; then
    return 1
  fi
  if [ "${runtime_head}" = "${CURRENT_HEAD}" ]; then
    return 1
  fi
  if ! git rev-parse --verify "${runtime_head}^{commit}" >/dev/null 2>&1; then
    return 0
  fi
  git diff --name-only "${runtime_head}..${CURRENT_HEAD}" -- electron/ | grep -q .
}

CURRENT_HEAD="$(resolve_current_head)"
STATUS_PROBE_RAN=0
STATUS_PROBE_OUTPUT=""
STATUS_PROBE_EXIT=0

probe_windows_client_status() {
  set +e
  STATUS_PROBE_OUTPUT="$(run_windows_client_action status)"
  STATUS_PROBE_EXIT=$?
  set -e
  STATUS_PROBE_RAN=1
}

run_windows_client_action() {
  local action="$1"
  local timeout_seconds="${WINDOWS_PREVIEW_TIMEOUT_SECONDS}"
  local output_file=""
  local action_pid=0
  local elapsed_seconds=0
  local exit_code=0
  if [ "${action}" = "status" ]; then
    timeout_seconds="${WINDOWS_PREVIEW_TIMEOUT_STATUS_SECONDS}"
  fi
  if [ "${action}" = "start" ]; then
    timeout_seconds="${WINDOWS_PREVIEW_TIMEOUT_START_SECONDS}"
  fi
  if [ "${action}" = "restart" ]; then
    timeout_seconds="${WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS}"
  fi
  if [ "${action}" = "stop" ]; then
    timeout_seconds="${WINDOWS_PREVIEW_TIMEOUT_STOP_SECONDS}"
  fi

  output_file="$(mktemp)"
  WINDOWS_CLIENT_ACTION="${action}" bash "${WINDOWS_CLIENT_SCRIPT}" >"${output_file}" 2>&1 &
  action_pid=$!
  while kill -0 "${action_pid}" 2>/dev/null; do
    local current_output=""
    current_output="$(cat "${output_file}")"
    if [ "${action}" = "restart" ] && echo "${current_output}" | grep -qE 'status:\s*RESTARTED'; then
      kill "${action_pid}" 2>/dev/null || true
      sleep 1
      kill -9 "${action_pid}" 2>/dev/null || true
      printf '%s' "${current_output}"
      rm -f "${output_file}"
      return 0
    fi
    if [ "${action}" = "start" ] && echo "${current_output}" | grep -qE 'status:\s*(RUNNING|STARTED)'; then
      kill "${action_pid}" 2>/dev/null || true
      sleep 1
      kill -9 "${action_pid}" 2>/dev/null || true
      printf '%s' "${current_output}"
      rm -f "${output_file}"
      return 0
    fi
    if [ "${action}" = "status" ] && echo "${current_output}" | grep -qE 'status:\s*(RUNNING|STOPPED)'; then
      kill "${action_pid}" 2>/dev/null || true
      sleep 1
      kill -9 "${action_pid}" 2>/dev/null || true
      printf '%s' "${current_output}"
      rm -f "${output_file}"
      return 0
    fi
    if [ "${action}" = "stop" ] && echo "${current_output}" | grep -qE 'status:\s*STOPPED'; then
      kill "${action_pid}" 2>/dev/null || true
      sleep 1
      kill -9 "${action_pid}" 2>/dev/null || true
      printf '%s' "${current_output}"
      rm -f "${output_file}"
      return 0
    fi
    if echo "${current_output}" | grep -qE 'status:\s*(RESTART_FAILED|START_FAILED)'; then
      kill "${action_pid}" 2>/dev/null || true
      sleep 1
      kill -9 "${action_pid}" 2>/dev/null || true
      printf '%s' "${current_output}"
      rm -f "${output_file}"
      return 1
    fi
    if [ "${elapsed_seconds}" -ge "${timeout_seconds}" ]; then
      kill "${action_pid}" 2>/dev/null || true
      sleep 1
      kill -9 "${action_pid}" 2>/dev/null || true
      printf '%s' "$(cat "${output_file}")"
      rm -f "${output_file}"
      return 124
    fi
    sleep 1
    elapsed_seconds=$((elapsed_seconds + 1))
  done

  set +e
  wait "${action_pid}"
  exit_code=$?
  set -e
  printf '%s' "$(cat "${output_file}")"
  rm -f "${output_file}"
  return "${exit_code}"
}

ensure_windows_client_running() {
  local status_output=""
  local status_exit=0
  local start_output=""
  local start_exit=0

  if [ "${STATUS_PROBE_RAN}" -eq 1 ]; then
    status_output="${STATUS_PROBE_OUTPUT}"
    status_exit="${STATUS_PROBE_EXIT}"
  else
    probe_windows_client_status
    status_output="${STATUS_PROBE_OUTPUT}"
    status_exit="${STATUS_PROBE_EXIT}"
  fi

  if [ "${status_exit}" -eq 0 ] && echo "${status_output}" | grep -qE 'status:\s*RUNNING'; then
    echo "[windows-preview] windows client: RUNNING"
    return 0
  fi

  if [ "${status_exit}" -eq 0 ] && echo "${status_output}" | grep -qE 'status:\s*STOPPED'; then
    echo "[windows-preview] windows client: STOPPED; starting"
    set +e
    start_output="$(run_windows_client_action start)"
    start_exit=$?
    set -e
    if [ "${start_exit}" -eq 0 ] && echo "${start_output}" | grep -qE 'status:\s*(RUNNING|STARTED)'; then
      echo "[windows-preview] windows client: RUNNING (after start)"
      return 0
    fi
    echo "[windows-preview] windows client: failed to start"
    if [ -n "${start_output}" ]; then
      echo "${start_output}"
    fi
    return 1
  fi

  if [ "${status_exit}" -eq 124 ]; then
    echo "[windows-preview] windows client: status probe timed out (${WINDOWS_PREVIEW_TIMEOUT_STATUS_SECONDS}s); aborting to avoid duplicate clients"
  else
    echo "[windows-preview] windows client: unknown status; aborting to avoid duplicate clients"
    if [ -n "${status_output}" ]; then
      echo "${status_output}"
    fi
  fi
  return 1
}

echo "[windows-preview] step 1/2: sync to windows mirror"
bash "${WINDOWS_SYNC_SCRIPT}"

changed_files="${WINDOWS_PREVIEW_CHANGED_FILES:-}"
if [ -z "${changed_files}" ]; then
  changed_files="$(
    {
      git diff --name-only
      git diff --name-only --cached
      git ls-files --others --exclude-standard
    } | sort -u
  )"
fi

restart_for_electron=0
restart_reason=""
restart_status_output=""
restart_status_exit=0

if echo "${changed_files}" | grep -qE '^electron/'; then
  restart_for_electron=1
  restart_reason="working tree electron changes detected"
else
  probe_windows_client_status
  restart_status_output="${STATUS_PROBE_OUTPUT}"
  restart_status_exit="${STATUS_PROBE_EXIT}"
  runtime_head="$(extract_runtime_head "${restart_status_output}")"
  if [ "${restart_status_exit}" -eq 0 ] && echo "${restart_status_output}" | grep -qE 'status:\s*RUNNING' && has_committed_electron_changes_since "${runtime_head}"; then
    restart_for_electron=1
    restart_reason="runtime behind committed electron changes"
  fi
fi

if [ "${restart_for_electron}" -eq 1 ]; then
  echo "[windows-preview] step 2/2: electron changes detected; evaluating client state"
  echo "[windows-preview] reason: ${restart_reason}"
  if [ "${WINDOWS_PREVIEW_ELECTRON_RESTART_MODE}" = "runtime-only" ]; then
    echo "[windows-preview] restart mode: runtime-only"
  else
    echo "[windows-preview] restart mode: full"
  fi
  if [ "${STATUS_PROBE_RAN}" -eq 0 ]; then
    probe_windows_client_status
    restart_status_output="${STATUS_PROBE_OUTPUT}"
    restart_status_exit="${STATUS_PROBE_EXIT}"
  fi
  if [ "${WINDOWS_PREVIEW_ELECTRON_RESTART_MODE}" != "runtime-only" ]; then
    if [ "${restart_status_exit}" -eq 0 ] && echo "${restart_status_output}" | grep -qE 'status:\s*RUNNING'; then
      echo "[windows-preview] windows client: RUNNING; full restarting (stop -> start)"
      set +e
      stop_output="$(run_windows_client_action stop)"
      stop_exit=$?
      set -e
      if [ "${stop_exit}" -ne 0 ] || ! echo "${stop_output}" | grep -qE 'status:\s*STOPPED'; then
        echo "[windows-preview] windows client: stop failed during full restart"
        if [ -n "${stop_output}" ]; then
          echo "${stop_output}"
        fi
        exit 1
      fi
    fi
    if [ "${restart_status_exit}" -eq 0 ] && echo "${restart_status_output}" | grep -qE 'status:\s*STOPPED'; then
      echo "[windows-preview] windows client: STOPPED; starting"
    fi
    set +e
    full_start_output="$(run_windows_client_action start)"
    full_start_exit=$?
    set -e
    if [ "${full_start_exit}" -eq 0 ] && echo "${full_start_output}" | grep -qE 'status:\s*(RUNNING|STARTED)'; then
      echo "[windows-preview] status: RESTARTED"
      exit 0
    fi
    echo "[windows-preview] windows client: full restart start phase failed"
    if [ -n "${full_start_output}" ]; then
      echo "${full_start_output}"
    fi
    exit 1
  fi
  if [ "${restart_status_exit}" -eq 0 ] && echo "${restart_status_output}" | grep -qE 'status:\s*RUNNING'; then
    echo "[windows-preview] windows client: RUNNING; restarting"
    set +e
    restart_output="$(run_windows_client_action restart)"
    restart_exit=$?
    set -e
    if [ "${restart_exit}" -eq 0 ] && echo "${restart_output}" | grep -qE 'status:\s*RESTARTED'; then
      echo "[windows-preview] status: RESTARTED"
      exit 0
    fi
    if [ "${restart_exit}" -eq 124 ]; then
      echo "[windows-preview] windows client: restart timed out (${WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS}s); aborting to avoid duplicate clients"
    else
      echo "[windows-preview] windows client: restart failed; aborting to avoid duplicate clients"
      if [ -n "${restart_output}" ]; then
        echo "${restart_output}"
      fi
    fi
    exit 1
  fi
  if [ "${restart_status_exit}" -eq 0 ] && echo "${restart_status_output}" | grep -qE 'status:\s*STOPPED'; then
    echo "[windows-preview] windows client: STOPPED; starting"
    set +e
    restart_start_output="$(run_windows_client_action start)"
    restart_start_exit=$?
    set -e
    if [ "${restart_start_exit}" -eq 0 ] && echo "${restart_start_output}" | grep -qE 'status:\s*(RUNNING|STARTED)'; then
      echo "[windows-preview] status: RESTARTED"
      exit 0
    fi
    echo "[windows-preview] windows client: failed to start from STOPPED state"
    if [ -n "${restart_start_output}" ]; then
      echo "${restart_start_output}"
    fi
    exit 1
  fi
  if [ "${restart_status_exit}" -eq 124 ]; then
    echo "[windows-preview] windows client: status probe timed out (${WINDOWS_PREVIEW_TIMEOUT_STATUS_SECONDS}s); aborting to avoid duplicate clients"
  else
    echo "[windows-preview] windows client: unknown status before restart; aborting to avoid duplicate clients"
    if [ -n "${restart_status_output}" ]; then
      echo "${restart_status_output}"
    fi
  fi
  exit 1
fi

ensure_windows_client_running
echo "[windows-preview] step 2/2: no electron changes; waiting for renderer HMR"
echo "[windows-preview] status: SYNCED"
