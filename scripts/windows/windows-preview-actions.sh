#!/usr/bin/env bash

run_sync_only() {
  echo "[windows-preview] selected action: sync-only"
  if wait_for_running_status "${WINDOWS_PREVIEW_TIMEOUT_STATUS_SECONDS}" "sync-only status"; then
    echo "[windows-preview] status: STARTED"
    return 0
  fi
  echo "[windows-preview] sync-only status check failed; falling back to full-restart"
  run_full_restart
}

run_renderer_reload_intent() {
  local reload_output=""
  local reload_exit=0
  local reload_intent_root=""
  local reload_nonce=""
  echo "[windows-preview] selected action: renderer-reload-intent"
  reload_intent_root="$(resolve_renderer_reload_intent_root)"
  set +e
  reload_output="$(
    FOLIOLE_RENDERER_RELOAD_INTENT_HEAD="${CURRENT_HEAD}" \
      FOLIOLE_RENDERER_RELOAD_INTENT_REASON="${SELECTED_REASON}" \
      FOLIOLE_RENDERER_RELOAD_INTENT_REQUESTED_BY="wsl-windows-preview" \
      FOLIOLE_RENDERER_RELOAD_INTENT_ROOT="${reload_intent_root}" \
      node "${WINDOWS_RENDERER_RELOAD_INTENT_SCRIPT}"
  )"
  reload_exit=$?
  set -e
  if [ "${reload_exit}" -eq 0 ] && echo "${reload_output}" | grep -qE 'status:\s*REQUESTED'; then
    echo "${reload_output}"
    reload_nonce="$(extract_intent_nonce "${reload_output}")"
    if [ -z "${reload_nonce}" ]; then
      echo "[windows-preview] renderer reload intent missing nonce"
      return 1
    fi
    if ! wait_for_delivery_nonce "$(resolve_renderer_reload_delivery_path)" "${reload_nonce}" "${WINDOWS_PREVIEW_TIMEOUT_SECONDS}" "renderer reload"; then
      echo "[windows-preview] renderer reload delivery missing; falling back to restart-intent"
      cancel_pending_renderer_reload_intent
      run_restart_intent
      return $?
    fi
    local requested_at=""
    requested_at="$(read_json_field "$(resolve_renderer_reload_delivery_path)" requestedAt 2>/dev/null || true)"
    if [ -z "${requested_at}" ]; then
      echo "[windows-preview] renderer reload delivery missing requestedAt nonce=${reload_nonce}"
      return 1
    fi
    if ! wait_for_ready_markers_after "${requested_at}" "${WINDOWS_PREVIEW_TIMEOUT_SECONDS}" "renderer reload"; then
      echo "[windows-preview] renderer reload did not reach app_ready; falling back to full-restart"
      run_full_restart
      return $?
    fi
    if ! wait_for_running_status "${WINDOWS_PREVIEW_TIMEOUT_STATUS_SECONDS}" "renderer reload status"; then
      echo "[windows-preview] renderer reload status check failed; falling back to full-restart"
      run_full_restart
      return $?
    fi
    echo "[windows-preview] status: STARTED"
    return 0
  fi
  echo "[windows-preview] renderer reload intent failed"
  if [ -n "${reload_output}" ]; then
    echo "${reload_output}"
  fi
  return 1
}

run_restart_intent() {
  local restart_output=""
  local restart_exit=0
  local restart_intent_root=""
  local restart_nonce=""
  local requested_at=""
  echo "[windows-preview] selected action: restart-intent"
  restart_intent_root="$(resolve_restart_intent_root)"
  set +e
  restart_output="$(
    FOLIOLE_RESTART_INTENT_HEAD="${CURRENT_HEAD}" \
      FOLIOLE_RESTART_INTENT_REASON="${SELECTED_REASON}" \
      FOLIOLE_RESTART_INTENT_REQUESTED_BY="wsl-windows-preview" \
      FOLIOLE_RESTART_INTENT_ROOT="${restart_intent_root}" \
      node "${WINDOWS_RESTART_INTENT_SCRIPT}"
  )"
  restart_exit=$?
  set -e
  if [ "${restart_exit}" -eq 0 ] && echo "${restart_output}" | grep -qE 'status:\s*REQUESTED'; then
    echo "${restart_output}"
    restart_nonce="$(extract_intent_nonce "${restart_output}")"
    if [ -z "${restart_nonce}" ]; then
      echo "[windows-preview] restart intent missing nonce"
      return 1
    fi
    if ! wait_for_delivery_nonce "$(resolve_restart_delivery_path)" "${restart_nonce}" "${WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS}" "restart"; then
      echo "[windows-preview] restart delivery missing after intent request; falling back to direct restart"
      run_direct_restart
      return $?
    fi
    requested_at="$(read_json_field "$(resolve_restart_delivery_path)" requestedAt 2>/dev/null || true)"
    if [ -z "${requested_at}" ]; then
      echo "[windows-preview] restart delivery missing requestedAt nonce=${restart_nonce}"
      return 1
    fi
    if ! wait_for_restart_ready_markers "${requested_at}" "${WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS}" "${SELECTED_RUNTIME_PID:-}"; then
      echo "[windows-preview] restart markers missing after intent delivery; falling back to direct restart"
      run_direct_restart
      return $?
    fi
    if ! wait_for_running_status "${WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS}" "restart status"; then
      echo "[windows-preview] restart status check failed after intent delivery; falling back to direct restart"
      run_direct_restart
      return $?
    fi
    echo "[windows-preview] status: STARTED"
    return 0
  fi
  echo "[windows-preview] restart intent failed"
  if [ -n "${restart_output}" ]; then
    echo "${restart_output}"
  fi
  return 1
}

run_fallback_start() {
  local start_output=""
  local start_exit=0
  echo "[windows-preview] selected action: fallback-start"
  set +e
  start_output="$(run_windows_client_action start)"
  start_exit=$?
  set -e
  if [ "${start_exit}" -eq 0 ] && status_is_started_or_running_trusted "${start_output}"; then
    if wait_for_running_status "${WINDOWS_PREVIEW_TIMEOUT_START_SECONDS}" "fallback start status"; then
      echo "[windows-preview] status: STARTED"
      return 0
    fi
    echo "[windows-preview] fallback start status check failed; falling back to full restart"
    run_full_restart
    return $?
  fi
  local recovery_status=""
  if recovery_status="$(probe_running_status_detail)"; then
    echo "[windows-preview] fallback start recovery status: $(extract_status_detail "${recovery_status}")"
    echo "[windows-preview] status: STARTED"
    return 0
  fi
  echo "[windows-preview] fallback start failed"
  if [ -n "${start_output}" ]; then
    echo "${start_output}"
  fi
  print_startup_failure_diagnostics
  return 1
}

run_full_restart() {
  local output=""
  local exit_code=0
  echo "[windows-preview] selected action: full-restart"
  set +e
  output="$(run_windows_client_action full-restart)"
  exit_code=$?
  set -e
  if [ "${exit_code}" -eq 0 ] && echo "${output}" | grep -qE 'status:\s*RESTARTED'; then
    echo "${output}"
    echo "[windows-preview] status: STARTED"
    return 0
  fi
  echo "[windows-preview] full restart failed"
  if [ -n "${output}" ]; then
    echo "${output}"
  fi
  print_startup_failure_diagnostics
  return 1
}

run_direct_restart() {
  local restart_output=""
  local restart_exit=0
  local requested_at=""
  requested_at="$(iso_now)"
  echo "[windows-preview] selected action: direct-restart"
  set +e
  restart_output="$(run_windows_client_action restart)"
  restart_exit=$?
  set -e
  if [ "${restart_exit}" -eq 0 ] && echo "${restart_output}" | grep -qE 'status:\s*RESTARTED'; then
    echo "${restart_output}"
    echo "[windows-preview] status: STARTED"
    return 0
  fi
  echo "[windows-preview] direct restart failed"
  if [ -n "${restart_output}" ]; then
    echo "${restart_output}"
  fi
  if wait_for_restart_ready_markers "${requested_at}" "${WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS}" &&
    wait_for_running_status "${WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS}" "direct restart status"; then
    echo "[windows-preview] direct restart recovered via fresh startup markers"
    echo "[windows-preview] status: STARTED"
    return 0
  fi
  print_startup_failure_diagnostics
  return 1
}

run_status_probe_failed() {
  echo "[windows-preview] selected action: status-probe-failed"
  echo "[windows-preview] status probe failed"
  return 1
}
