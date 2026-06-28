#!/usr/bin/env bash

quality_gate_collect_failures_enabled() {
  [[ "${QUALITY_GATE_COLLECT_FAILURES:-0}" == "1" ]]
}

mark_quality_gate_collected_failure() {
  QUALITY_GATE_COLLECT_FAILED=1
}

finish_quality_gate_collection() {
  local prefix="$1"
  if quality_gate_collect_failures_enabled && [[ "${QUALITY_GATE_COLLECT_FAILED:-0}" == "1" ]]; then
    echo "[${prefix}] collected failures summary: $(create_quality_gate_failed_file)"
    return 1
  fi
}

collect_failed_test_files() {
  local output_file="$1"
  local script_name="${2:-}"
  local json_report

  json_report="$(resolve_vitest_json_report_file "${script_name}")"
  if [[ -n "${json_report}" && -s "${json_report}" ]]; then
    collect_failed_test_files_from_json "${json_report}" && return 0
  fi

  grep -Eo '([[:alnum:]_./-]+\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs))' "${output_file}" 2>/dev/null | sort -u || true
}

resolve_vitest_json_report_file() {
  local script_name="$1"
  case "${script_name}" in
    test) printf '.tmp/vitest/related.json' ;;
    test:desktop) printf '.tmp/vitest/desktop.json' ;;
    test:desktop:src) printf '.tmp/vitest/desktop-src.json' ;;
    test:desktop:electron) printf '.tmp/vitest/desktop-electron.json' ;;
    test:android) printf '.tmp/vitest/android.json' ;;
    test:shared) printf '.tmp/vitest/shared.json' ;;
    test:release:desktop-src) printf '.tmp/vitest/release-desktop-src.json' ;;
    test:release:android) printf '.tmp/vitest/release-android.json' ;;
    test:release:shared) printf '.tmp/vitest/release-shared.json' ;;
    test:sync-pack) printf '.tmp/vitest/sync-pack.json' ;;
    test:quality) printf '.tmp/vitest/quality.json' ;;
    test:quality:core) printf '.tmp/vitest/quality-core.json' ;;
    test:quality:gate) printf '.tmp/vitest/quality-gate.json' ;;
    test:quality:gate-integration) printf '.tmp/vitest/quality-gate-integration.json' ;;
    test:quality:gate-integration:routing) printf '.tmp/vitest/quality-gate-integration-routing.json' ;;
    test:quality:gate-integration:fast-delegation) printf '.tmp/vitest/quality-gate-integration-fast-delegation.json' ;;
    test:quality:gate-integration:targets) printf '.tmp/vitest/quality-gate-integration-targets.json' ;;
    test:quality:gate-integration:target-core) printf '.tmp/vitest/quality-gate-integration-target-core.json' ;;
    test:quality:gate-integration:target-failures) printf '.tmp/vitest/quality-gate-integration-target-failures.json' ;;
    test:quality:gate-integration:target-collect) printf '.tmp/vitest/quality-gate-integration-target-collect.json' ;;
    test:quality:gate-integration:target-telemetry) printf '.tmp/vitest/quality-gate-integration-target-telemetry.json' ;;
    test:quality:gate-integration:release-targets) printf '.tmp/vitest/quality-gate-integration-release-targets.json' ;;
    test:quality:gate-integration:release-tail) printf '.tmp/vitest/quality-gate-integration-release-tail.json' ;;
    test:quality:node) printf '.tmp/vitest/quality-node.json' ;;
    test:quality:preview) printf '.tmp/vitest/quality-preview.json' ;;
    test:full) printf '.tmp/vitest/full.json' ;;
    test:changed) printf '.tmp/vitest/changed.json' ;;
    check:android-boundary) printf '.tmp/vitest/android-boundary.json' ;;
  esac
}

collect_failed_test_files_from_json() {
  local json_report="$1"
  node - "${json_report}" <<'NODE'
const fs = require('node:fs');
const path = process.argv[2];
const testFilePattern = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/;

function normalizeFile(value) {
  if (typeof value !== 'string' || !testFilePattern.test(value)) {
    return '';
  }
  return value.replace(/\\/g, '/');
}

function hasFailedStatus(value) {
  return value === 'failed' || value === 'fail' || value === 'FAIL';
}

function collectFailedFiles(node, inheritedFile, out) {
  if (!node || typeof node !== 'object') {
    return;
  }

  const currentFile =
    normalizeFile(node.filepath) ||
    normalizeFile(node.file) ||
    normalizeFile(node.name) ||
    normalizeFile(node.filename) ||
    inheritedFile;

  if (hasFailedStatus(node.status) && currentFile) {
    out.add(currentFile);
  }

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        collectFailedFiles(item, currentFile, out);
      }
    } else if (value && typeof value === 'object') {
      collectFailedFiles(value, currentFile, out);
    }
  }
}

try {
  const parsed = JSON.parse(fs.readFileSync(path, 'utf8'));
  const failedFiles = new Set();
  collectFailedFiles(parsed, '', failedFiles);
  console.log([...failedFiles].sort().join('\n'));
} catch {
  process.exitCode = 1;
}
NODE
}

resolve_quality_gate_rerun_command() {
  local script_name="$1"
  local output_file="$2"
  shift 2

  local failed_tests command_text
  command_text="$(quote_quality_gate_command "$@")"

  if [[ "${script_name}" == test* || "${script_name}" == "check:android-boundary" ]]; then
    failed_tests="$(collect_failed_test_files "${output_file}" "${script_name}")"
    if [[ -n "${failed_tests}" ]]; then
      local -a failed_test_array
      mapfile -t failed_test_array <<< "${failed_tests}"
      printf 'node scripts/run-vitest-with-summary.mjs .tmp/vitest/rerun.json -- --silent=passed-only --pool=threads --maxWorkers=2 --no-file-parallelism'
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
    failed_tests="$(collect_failed_test_files "${output_file}" "${script_name}")"
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
