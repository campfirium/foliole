#!/usr/bin/env bash

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

extract_status_reason() {
  printf '%s\n' "$1" | sed -n 's/.* reason=\([^[:space:]]*\).*/\1/p' | head -n 1
}

extract_status_detail() {
  printf '%s\n' "$1" | sed -n 's/^\[windows-restart-client\] //p' | tail -n 1
}

extract_runtime_pid() {
  printf '%s\n' "$1" | sed -n 's/.* runtime_pid=\([0-9][0-9]*\).*/\1/p' | head -n 1
}

extract_intent_nonce() {
  printf '%s\n' "$1" | sed -n 's/.* nonce=\([^[:space:]]*\).*/\1/p' | head -n 1
}

read_json_field() {
  local file_path="$1"
  local field_name="$2"
  if [ ! -f "${file_path}" ]; then
    return 1
  fi
  node -e '
const fs = require("node:fs");
const filePath = process.argv[1];
const fieldName = process.argv[2];
const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
const value = payload?.[fieldName];
if (value === undefined || value === null || value === "") {
  process.exit(1);
}
process.stdout.write(String(value));
' "${file_path}" "${field_name}"
}

iso_now() {
  node -e 'process.stdout.write(new Date().toISOString())'
}

iso_timestamp_gte() {
  local left="$1"
  local right="$2"
  [ "${left}" = "${right}" ] || [[ "${left}" > "${right}" ]]
}

status_is_running() {
  echo "$1" | grep -qE 'status:\s*RUNNING'
}

status_is_stopped() {
  echo "$1" | grep -qE 'status:\s*STOPPED'
}

status_is_running_trusted() {
  echo "$1" | grep -qE 'status:\s*RUNNING\b' && echo "$1" | grep -qE 'trust=OK'
}

status_is_started_or_running_trusted() {
  echo "$1" | grep -qE 'status:\s*STARTED' || status_is_running_trusted "$1"
}

print_startup_failure_diagnostics() {
  if [ -f "${WINDOWS_STARTUP_DIAGNOSTICS_SCRIPT}" ]; then
    node "${WINDOWS_STARTUP_DIAGNOSTICS_SCRIPT}" || true
  fi
}
