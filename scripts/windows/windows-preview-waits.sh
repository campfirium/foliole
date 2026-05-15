#!/usr/bin/env bash

wait_for_delivery_nonce() {
  local delivery_path="$1"
  local expected_nonce="$2"
  local timeout_seconds="$3"
  local label="$4"
  local elapsed_seconds=0

  while [ "${elapsed_seconds}" -lt "${timeout_seconds}" ]; do
    local delivered_nonce=""
    set +e
    delivered_nonce="$(read_json_field "${delivery_path}" nonce 2>/dev/null)"
    local read_exit=$?
    set -e
    if [ "${read_exit}" -eq 0 ] && [ "${delivered_nonce}" = "${expected_nonce}" ]; then
      echo "[windows-preview] ${label} delivery acknowledged nonce=${expected_nonce}"
      return 0
    fi
    sleep 1
    elapsed_seconds=$((elapsed_seconds + 1))
  done

  echo "[windows-preview] ${label} delivery timed out nonce=${expected_nonce}"
  return 1
}

wait_for_running_status() {
  local timeout_seconds="$1"
  local status_label="$2"
  local elapsed_seconds=0

  while [ "${elapsed_seconds}" -lt "${timeout_seconds}" ]; do
    local status_output=""
    local status_exit=0
    set +e
    status_output="$(run_windows_client_action status)"
    status_exit=$?
    set -e
    if [ "${status_exit}" -eq 0 ] && status_is_running_trusted "${status_output}"; then
      echo "[windows-preview] ${status_label}: $(extract_status_detail "${status_output}")"
      return 0
    fi
    sleep 1
    elapsed_seconds=$((elapsed_seconds + 1))
  done

  echo "[windows-preview] ${status_label} timed out"
  return 1
}

restart_ready_can_use_existing_markers() {
  local requested_at="$1"
  local previous_runtime_pid="${2:-}"
  local boot_ready_path=""
  local bridge_ready_path=""
  local boot_timestamp=""
  local bridge_timestamp=""
  local status_output=""
  local status_exit=0
  local current_runtime_pid=""
  local runtime_head=""

  boot_ready_path="$(resolve_boot_ready_path)"
  bridge_ready_path="$(resolve_bridge_ready_path)"
  set +e
  boot_timestamp="$(read_json_field "${boot_ready_path}" timestamp 2>/dev/null)"
  local boot_exit=$?
  bridge_timestamp="$(read_json_field "${bridge_ready_path}" timestamp 2>/dev/null)"
  local bridge_exit=$?
  status_output="$(run_windows_client_action status)"
  status_exit=$?
  set -e

  if [ "${boot_exit}" -ne 0 ] || [ "${bridge_exit}" -ne 0 ]; then
    return 1
  fi
  if [ "${status_exit}" -ne 0 ] || ! status_is_running_trusted "${status_output}"; then
    return 1
  fi

  current_runtime_pid="$(extract_runtime_pid "${status_output}")"
  runtime_head="$(extract_runtime_head "${status_output}")"

  if [ -n "${previous_runtime_pid}" ] && [ -n "${current_runtime_pid}" ] && [ "${current_runtime_pid}" != "${previous_runtime_pid}" ]; then
    echo "[windows-preview] restart markers accepted via trusted running status runtime_pid=${current_runtime_pid} boot=${boot_timestamp} bridge=${bridge_timestamp}"
    return 0
  fi

  if [ -n "${CURRENT_HEAD}" ] && [ -n "${runtime_head}" ] && [ "${runtime_head}" = "${CURRENT_HEAD}" ]; then
    echo "[windows-preview] restart markers accepted via trusted running current head=${runtime_head} boot=${boot_timestamp} bridge=${bridge_timestamp}"
    return 0
  fi

  return 1
}

wait_for_restart_ready_markers() {
  local requested_at="$1"
  local timeout_seconds="$2"
  local previous_runtime_pid="${3:-}"
  local boot_ready_path
  local bridge_ready_path
  local elapsed_seconds=0

  boot_ready_path="$(resolve_boot_ready_path)"
  bridge_ready_path="$(resolve_bridge_ready_path)"

  while [ "${elapsed_seconds}" -lt "${timeout_seconds}" ]; do
    local boot_timestamp=""
    local bridge_timestamp=""
    set +e
    boot_timestamp="$(read_json_field "${boot_ready_path}" timestamp 2>/dev/null)"
    local boot_exit=$?
    bridge_timestamp="$(read_json_field "${bridge_ready_path}" timestamp 2>/dev/null)"
    local bridge_exit=$?
    set -e
    if [ "${boot_exit}" -eq 0 ] && [ "${bridge_exit}" -eq 0 ] &&
      iso_timestamp_gte "${boot_timestamp}" "${requested_at}" &&
      iso_timestamp_gte "${bridge_timestamp}" "${requested_at}"; then
      echo "[windows-preview] restart markers updated boot=${boot_timestamp} bridge=${bridge_timestamp}"
      return 0
    fi
    if restart_ready_can_use_existing_markers "${requested_at}" "${previous_runtime_pid}"; then
      return 0
    fi
    sleep 1
    elapsed_seconds=$((elapsed_seconds + 1))
  done

  echo "[windows-preview] restart markers timed out requested_at=${requested_at}"
  return 1
}
