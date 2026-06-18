#!/usr/bin/env bash

create_quality_gate_telemetry_file() {
  ensure_quality_gate_run_dir
  printf '%s/telemetry.jsonl' "${QUALITY_GATE_RUN_DIR}"
}

json_escape_quality_gate_value() {
  node -e 'process.stdout.write(JSON.stringify(process.argv[1] ?? ""))' "$1"
}

append_quality_gate_telemetry() {
  local prefix="$1"
  local script_name="$2"
  local display_name="$3"
  local exit_code="$4"
  local duration_seconds="$5"
  local peak_rss_kb="$6"
  local output_file="$7"

  local telemetry_file telemetry_lock_file started_at ended_at line
  telemetry_file="$(create_quality_gate_telemetry_file)"
  telemetry_lock_file="${telemetry_file}.lock"
  started_at="${QUALITY_GATE_CURRENT_STARTED_AT:-}"
  ended_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  line="$(node - "$prefix" "$script_name" "$display_name" "$exit_code" "$duration_seconds" "$peak_rss_kb" "$output_file" "$started_at" "$ended_at" <<'NODE'
const [prefix, scriptName, displayName, exitCode, durationSeconds, peakRssKb, outputFile, startedAt, endedAt] = process.argv.slice(2);
const entry = {
  prefix,
  scriptName,
  displayName,
  exitCode: Number(exitCode),
  durationSeconds: Number(durationSeconds),
  peakRssKb: Number(peakRssKb),
  logPath: outputFile,
  startedAt,
  endedAt
};
process.stdout.write(JSON.stringify(entry));
NODE
)"

  if command -v flock >/dev/null 2>&1; then
    if ! { flock 9; printf '%s\n' "${line}" >>"${telemetry_file}"; } 9>"${telemetry_lock_file}"; then
      echo "[${prefix}] warning: unable to write quality gate telemetry: ${telemetry_file}" >&2
    fi
    return
  fi

  if ! printf '%s\n' "${line}" >>"${telemetry_file}"; then
    echo "[${prefix}] warning: unable to write quality gate telemetry: ${telemetry_file}" >&2
  fi
}
