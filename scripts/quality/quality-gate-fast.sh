#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/quality-gate-lib.sh"
source "${SCRIPT_DIR}/quality-gate-fast-routing.sh"
source "${SCRIPT_DIR}/quality-gate-fast-static-guards.sh"

if [[ ! -f "package.json" ]]; then
  echo "[quality-gate-fast] package.json not found."
  exit 1
fi

cleanup_pids=()
register_cleanup_pid() {
  cleanup_pids+=("$1")
}

cleanup_quality_gate_processes() {
  trap - EXIT INT TERM

  local pid
  for pid in "${cleanup_pids[@]:-}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
    fi
  done

  if [[ -n "${QUALITY_GATE_ACTIVE_PGID:-}" ]]; then
    terminate_process_group "${QUALITY_GATE_ACTIVE_PGID}"
  fi
}

trap cleanup_quality_gate_processes EXIT INT TERM

pm="$(resolve_package_manager)"

if [[ "$#" -gt 1 ]] || { [[ "$#" -eq 1 ]] && [[ "$1" != "--route" && "$1" != "--route-json" ]]; }; then
  echo "[quality-gate-fast] only --route or --route-json is accepted; aggregate quality is hosted-only"
  exit 2
fi

run_changed_lint() {
  local lint_targets="$1"
  if [[ -z "${lint_targets}" ]]; then
    if quality_gate_should_print_step; then
      echo "[quality-gate-fast] no lintable changed files detected — skipping scoped lint"
    fi
    return 0
  fi

  lint_array=()
  while IFS= read -r lint_target; do
    [[ -n "${lint_target}" ]] && lint_array+=("${lint_target}")
  done <<< "${lint_targets}"
  if [[ -f "node_modules/eslint/bin/eslint.js" ]]; then
    run_quality_gate_command "quality-gate-fast" "lint" "lint (changed files)" node node_modules/eslint/bin/eslint.js --cache --cache-location .tmp/eslint-cache/changed/ "${lint_array[@]}"
    return 0
  fi
  if [[ -x "./node_modules/.bin/eslint" ]]; then
    run_quality_gate_command "quality-gate-fast" "lint" "lint (changed files)" ./node_modules/.bin/eslint --cache --cache-location .tmp/eslint-cache/changed/ "${lint_array[@]}"
    return 0
  fi
  if command -v npx >/dev/null 2>&1; then
    run_quality_gate_command "quality-gate-fast" "lint" "lint (changed files)" npx eslint --cache --cache-location .tmp/eslint-cache/changed/ "${lint_array[@]}"
    return 0
  fi
  if [[ "${pm}" == "yarn" ]] && command -v yarn >/dev/null 2>&1; then
    run_quality_gate_command "quality-gate-fast" "lint" "lint (changed files)" yarn exec eslint --cache --cache-location .tmp/eslint-cache/changed/ "${lint_array[@]}"
    return 0
  fi

  echo "[quality-gate-fast] unable to resolve eslint for scoped lint"
  return 1
}

run_parallel_lint_and_typecheck() {
  local lint_mode="$1"
  local lint_targets="$2"
  local lint_log typecheck_log lint_ok typecheck_ok

  lint_log="$(create_quality_gate_log_file "lint.parallel")"
  typecheck_log="$(create_quality_gate_log_file "typecheck.parallel")"
  : >"${lint_log}"
  : >"${typecheck_log}"

  if quality_gate_should_print_step; then
    echo "[quality-gate-fast] running: ${lint_mode} + typecheck (parallel)"
  fi

  (
    trap 'if [[ -n "${QUALITY_GATE_ACTIVE_PGID:-}" ]]; then terminate_process_group "${QUALITY_GATE_ACTIVE_PGID}"; fi' EXIT INT TERM
    run_changed_lint "${lint_targets}" >"${lint_log}" 2>&1
  ) &
  lint_pid=$!
  register_cleanup_pid "${lint_pid}"

  (
    trap 'if [[ -n "${QUALITY_GATE_ACTIVE_PGID:-}" ]]; then terminate_process_group "${QUALITY_GATE_ACTIVE_PGID}"; fi' EXIT INT TERM
    run_quality_gate_script "quality-gate-fast" "${pm}" "typecheck" >"${typecheck_log}" 2>&1
  ) &
  typecheck_pid=$!
  register_cleanup_pid "${typecheck_pid}"

  lint_ok=0
  typecheck_ok=0
  set +e
  wait "${lint_pid}"; lint_ok=$?
  wait "${typecheck_pid}"; typecheck_ok=$?
  set -e

  if [[ "${lint_ok}" -ne 0 ]]; then
    echo "[quality-gate-fast] lint failed:"
    echo "[quality-gate-fast] full log: ${lint_log}"
    cat "${lint_log}"
  fi
  if [[ "${typecheck_ok}" -ne 0 ]]; then
    echo "[quality-gate-fast] typecheck failed:"
    echo "[quality-gate-fast] full log: ${typecheck_log}"
    cat "${typecheck_log}"
  fi
  cleanup_pids=()

  if [[ "${lint_ok}" -ne 0 || "${typecheck_ok}" -ne 0 ]]; then
    exit 1
  fi
}

run_related_tests_if_needed() {
  local changed="$1"
  local test_files count

  test_files="$(collect_related_test_files "${changed}")"
  if [[ -z "${test_files}" ]]; then
    if quality_gate_should_print_step; then
      echo "[quality-gate-fast] changes detected but no related tests found — skipping tests"
    fi
    return 0
  fi

  count="$(echo "${test_files}" | wc -l | tr -d ' ')"
  if quality_gate_should_print_step; then
    echo "[quality-gate-fast] running: ${count} related test file(s)"
    echo "${test_files}" | sed 's/^/  /'
  fi

  test_array=()
  while IFS= read -r test_file; do
    [[ -n "${test_file}" ]] && test_array+=("${test_file}")
  done <<< "${test_files}"
  run_quality_gate_command \
    "quality-gate-fast" \
    "test" \
    "test (related)" \
    node "${SCRIPT_DIR}/quality-fast-related-tests.mjs" "${test_array[@]}"
}

if quality_gate_should_print_step && ! has_quality_gate_arg "--route" "$@" && ! has_quality_gate_arg "--route-json" "$@"; then
  echo "[quality-gate-fast] detected package manager: ${pm}"
fi

all_changed="$(collect_changed_files)"
level="$(resolve_quality_gate_level "${all_changed}")"

if has_quality_gate_arg "--route" "$@"; then
  print_quality_gate_route_plan "${all_changed}" "${level}"
  exit 0
fi

if has_quality_gate_arg "--route-json" "$@"; then
  print_quality_gate_route_plan "${all_changed}" "${level}" | node "${SCRIPT_DIR}/quality-gate-route-json.mjs"
  exit 0
fi

if quality_gate_should_print_step; then
  echo "[quality-gate-fast] selected level: ${level}"
fi

run_quality_gate_fast_t0_static_guards
run_quality_gate_fast_global_static_guards

if [[ "${level}" =~ ^(full|desktop|shared|android|ios)$ ]]; then
  print_quality_gate_route_plan "${all_changed}" "${level}" \
    | node "${SCRIPT_DIR}/quality-gate-route-json.mjs" \
    | node "${SCRIPT_DIR}/quality-fast-capped.mjs"
  echo "[quality-gate-fast] hosted quality deferred to scheduled T7 Hosted Quality; Remote Quality is reserved for repair or explicit rechecks on dev, while releases use T7 Release."
  echo "[quality-gate-fast] capped local checks passed."
  exit 0
fi

run_quality_gate_fast_light_mid_static_guards
if [[ -f "scripts/quality/quality-skip-lint.mjs" ]] && quality_skip_lint_changed_files_match "${all_changed}"; then
  run_quality_gate_command "quality-gate-fast" "quality-skip-lint" "quality skip lint" node scripts/quality/quality-skip-lint.mjs
fi

lint_targets="$(collect_lint_targets "${all_changed}")"
if [[ "${level}" == "mid" ]]; then
  run_parallel_lint_and_typecheck "scoped lint" "${lint_targets}"
  if [[ -f "scripts/check-workspace-settings-boundary.mjs" ]]; then
    if quality_gate_should_print_step; then
      echo "[quality-gate-fast] running: workspace settings boundary"
    fi
    node scripts/check-workspace-settings-boundary.mjs
  fi
  run_related_tests_if_needed "${all_changed}"
else
  if [[ -z "${all_changed}" ]]; then
    run_parallel_lint_and_typecheck "scoped lint" ""
  else
    run_parallel_lint_and_typecheck "scoped lint" "${lint_targets}"
    run_related_tests_if_needed "${all_changed}"
  fi
fi

echo "[quality-gate-fast] all checks passed."
