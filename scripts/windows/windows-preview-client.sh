#!/usr/bin/env bash

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
  if [ "${action}" = "restart" ] || [ "${action}" = "full-restart" ]; then
    timeout_seconds="${WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS}"
  fi

  output_file="$(mktemp)"
  WINDOWS_CLIENT_ACTION="${action}" bash "${WINDOWS_CLIENT_SCRIPT}" >"${output_file}" 2>&1 &
  action_pid=$!
  while kill -0 "${action_pid}" 2>/dev/null; do
    local current_output=""
    local status_probe_output=""
    current_output="$(cat "${output_file}")"
    if { [ "${action}" = "restart" ] || [ "${action}" = "full-restart" ]; } && echo "${current_output}" | grep -qE 'status:\s*RESTARTED'; then
      kill "${action_pid}" 2>/dev/null || true
      sleep 1
      kill -9 "${action_pid}" 2>/dev/null || true
      printf '%s' "${current_output}"
      rm -f "${output_file}"
      return 0
    fi
    if [ "${action}" = "start" ] && echo "${current_output}" | grep -qE 'status:\s*STARTED'; then
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
    if [ "${action}" = "start" ] &&
      status_probe_output="$(probe_running_status_detail)"; then
      kill "${action_pid}" 2>/dev/null || true
      sleep 1
      kill -9 "${action_pid}" 2>/dev/null || true
      if [ -n "${current_output}" ]; then
        printf '%s\n%s' "${current_output}" "${status_probe_output}"
      else
        printf '%s' "${status_probe_output}"
      fi
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

ensure_fresh_electron_dist() {
  local freshness_output=""
  local freshness_exit=0
  set +e
  freshness_output="$(node "${WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT}" 2>&1)"
  freshness_exit=$?
  set -e
  if [ "${freshness_exit}" -eq 0 ]; then
    printf '%s\n' "${freshness_output}"
    return 0
  fi

  printf '%s\n' "${freshness_output}"
  echo "[windows-preview] electron-dist stale; compiling runtime bundle"
  eval "${WINDOWS_ELECTRON_COMPILE_COMMAND}"
  node "${WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT}"
}

verify_windows_node_modules() {
  local output=""
  local exit_code=0
  set +e
  if [ -n "${WINDOWS_NODE_MODULES_CHECK_COMMAND}" ]; then
    output="$(eval "${WINDOWS_NODE_MODULES_CHECK_COMMAND}" 2>&1)"
    exit_code=$?
  else
    output="$(
      powershell.exe -NoProfile -NonInteractive -Command "\$ErrorActionPreference='Stop'; \$env:PATHEXT='.COM;.EXE;.BAT;.CMD;.PS1'; Set-Location -LiteralPath '${WINDOWS_WORKDIR}'; npm.cmd ls --depth=0 --json --silent | Out-Null; if (\$LASTEXITCODE -ne 0) { exit \$LASTEXITCODE }" 2>&1
    )"
    exit_code=$?
  fi
  set -e
  if [ "${exit_code}" -eq 0 ]; then
    echo "[windows-preview] windows node_modules check passed"
    return 0
  fi

  echo "[windows-preview] windows node_modules check failed"
  echo "[windows-preview] hint: install missing packages only when needed, then restore Electron native ABI before preview; do not run plain Node npm rebuild for better-sqlite3 in ${WINDOWS_WORKDIR}"
  if [ -n "${output}" ]; then
    printf '%s\n' "${output}" | tail -n 80
  fi
  return 1
}

verify_windows_native_abi() {
  local output=""
  local exit_code=0
  set +e
  if [ -n "${WINDOWS_NATIVE_ABI_CHECK_COMMAND}" ]; then
    output="$(eval "${WINDOWS_NATIVE_ABI_CHECK_COMMAND}" 2>&1)"
    exit_code=$?
  else
    output="$(
      powershell.exe -NoProfile -NonInteractive -Command "\$ErrorActionPreference='Stop'; Set-Location -LiteralPath '${WINDOWS_WORKDIR}'; & '.\\${WINDOWS_NATIVE_ABI_PREFLIGHT_SCRIPT}' -WorkDir '${WINDOWS_WORKDIR}' -Run" 2>&1
    )"
    exit_code=$?
  fi
  set -e
  if [ "${exit_code}" -eq 0 ]; then
    echo "[windows-preview] windows native ABI preflight passed"
    return 0
  fi

  echo "[windows-preview] windows native ABI preflight failed"
  echo "[windows-preview] hint: restore better-sqlite3 for the Electron ABI in ${WINDOWS_WORKDIR}; do not run plain Node npm rebuild for this native module"
  if [ -n "${output}" ]; then
    printf '%s\n' "${output}" | tail -n 80
  fi
  return 1
}

probe_running_status_detail() {
  local status_output=""
  local status_exit=0
  set +e
  status_output="$(run_windows_client_action status)"
  status_exit=$?
  set -e
  if [ "${status_exit}" -eq 0 ] && status_is_running_trusted "${status_output}"; then
    printf '%s' "${status_output}"
    return 0
  fi
  return 1
}
