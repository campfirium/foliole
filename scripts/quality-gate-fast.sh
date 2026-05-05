#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/quality-gate-lib.sh"

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

collect_changed_files() {
  if [[ -n "${QUALITY_GATE_CHANGED_FILES:-}" ]]; then
    printf '%s\n' "${QUALITY_GATE_CHANGED_FILES}" | grep -v '^\s*$' | sort -u || true
    return 0
  fi

  local staged unstaged untracked
  staged="$(git diff --cached --name-only -- . 2>/dev/null || true)"
  unstaged="$(git diff --name-only -- . 2>/dev/null || true)"
  untracked="$(git ls-files --others --exclude-standard -- . 2>/dev/null || true)"

  printf '%s\n%s\n%s\n' "${staged}" "${unstaged}" "${untracked}" | grep -v '^\s*$' | sort -u || true
}

diff_has_mid_scope_signature() {
  local file_path="$1"
  local tracked_pattern='^[+-].*(export[[:space:]]+(type|interface)|((type|interface)[[:space:]]+[A-Za-z0-9_]*Props))'
  local untracked_pattern='(export[[:space:]]+(type|interface)|((type|interface)[[:space:]]+[A-Za-z0-9_]*Props))'

  if git ls-files --error-unmatch "${file_path}" >/dev/null 2>&1; then
    git diff --unified=0 -- "${file_path}" 2>/dev/null | grep -E -q "${tracked_pattern}"
    return $?
  fi

  [[ -f "${file_path}" ]] && grep -E -q "${untracked_pattern}" "${file_path}"
}

resolve_quality_gate_level() {
  local changed="$1"

  if printf '%s\n' "${changed}" | grep -E -q '^(android/|scripts/android/|src/companion/|capacitor\.config\.ts$|vite\.companion\.config\.ts$)'; then
    printf 'android'
    return 0
  fi

  if printf '%s\n' "${changed}" | grep -E -q '^(electron/|lib/|src/store/|src/shared/platform/|scripts/|package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?$)'; then
    printf 'full'
    return 0
  fi

  local file_path base_name
  while IFS= read -r file_path; do
    [[ -z "${file_path}" ]] && continue
    [[ "${file_path}" =~ \.(test|spec)\.[^.]+$ ]] && continue
    if [[ "${file_path}" =~ ^src/shared/ui/ ]]; then
      printf 'mid'
      return 0
    fi
    if [[ "${file_path}" =~ ^src/(features/|app/components/) ]]; then
      base_name="$(basename "${file_path}")"
      if [[ "${base_name}" =~ ^index\.(ts|tsx)$ || "${base_name}" =~ types?\.[^.]+$ ]] || diff_has_mid_scope_signature "${file_path}"; then
        printf 'mid'
        return 0
      fi
    fi
  done <<< "${changed}"

  printf 'light'
}

collect_lint_targets() {
  local changed="$1"
  printf '%s\n' "${changed}" | grep -E '\.(js|jsx|ts|tsx|cjs|mjs)$' | grep -v '^\s*$' || true
}

run_changed_lint() {
  local lint_targets="$1"
  if [[ -z "${lint_targets}" ]]; then
    if quality_gate_should_print_step; then
      echo "[quality-gate-fast] no lintable changed files detected — skipping scoped lint"
    fi
    return 0
  fi

  mapfile -t lint_array <<< "${lint_targets}"
  if [[ -x "./node_modules/.bin/eslint" ]]; then
    run_quality_gate_command "quality-gate-fast" "lint" "lint (changed files)" ./node_modules/.bin/eslint "${lint_array[@]}"
    return 0
  fi
  if command -v npx >/dev/null 2>&1; then
    run_quality_gate_command "quality-gate-fast" "lint" "lint (changed files)" npx eslint "${lint_array[@]}"
    return 0
  fi
  if [[ "${pm}" == "yarn" ]] && command -v yarn >/dev/null 2>&1; then
    run_quality_gate_command "quality-gate-fast" "lint" "lint (changed files)" yarn exec eslint "${lint_array[@]}"
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
    if [[ "${lint_mode}" == "full lint" ]]; then
      run_quality_gate_script "quality-gate-fast" "${pm}" "lint" >"${lint_log}" 2>&1
    else
      run_changed_lint "${lint_targets}" >"${lint_log}" 2>&1
    fi
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
  local source_changed direct_tests source_files inferred_tests test_files count

  source_changed="$(printf '%s\n' "${changed}" | grep -E '^(src/|electron/|scripts/).*\.(ts|tsx|mjs)$' || true)"
  if [[ -z "${source_changed}" ]]; then
    if quality_gate_should_print_step; then
      echo "[quality-gate-fast] no source changes detected — skipping tests"
    fi
    return 0
  fi

  direct_tests="$(echo "${source_changed}" | grep -E '\.(test|spec)\.' || true)"
  source_files="$(echo "${source_changed}" | grep -vE '\.(test|spec)\.' || true)"
  inferred_tests=""

  if [[ -n "${source_files}" ]]; then
    while IFS= read -r src_file; do
      [[ -z "${src_file}" ]] && continue
      local dir base stem candidate
      dir="$(dirname "${src_file}")"
      base="$(basename "${src_file}")"
      stem="${base%.*}"
      for ext in test.ts test.tsx; do
        candidate="${dir}/${stem}.${ext}"
        if [[ -f "${candidate}" ]]; then
          inferred_tests="${inferred_tests}${candidate}"$'\n'
        fi
      done
    done <<< "${source_files}"
  fi

  test_files="$(printf '%s\n%s' "${direct_tests}" "${inferred_tests}" | grep -v '^\s*$' | sort -u || true)"

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

  mapfile -t test_array <<< "${test_files}"
  run_quality_gate_command \
    "quality-gate-fast" \
    "test" \
    "test (related)" \
    npx vitest run --pool=threads --maxWorkers=2 "${test_array[@]}"
}

if quality_gate_should_print_step; then
  echo "[quality-gate-fast] detected package manager: ${pm}"
fi

if [[ "${1:-}" == "--full" ]]; then
  if quality_gate_should_print_step; then
    echo "[quality-gate-fast] forcing full quality gate"
  fi
  exec bash "${SCRIPT_DIR}/quality-gate-target.sh" full
fi

if [[ "${1:-}" == "--release" ]]; then
  if quality_gate_should_print_step; then
    echo "[quality-gate-fast] forcing release quality gate"
  fi
  exec bash "${SCRIPT_DIR}/quality-gate-target.sh" release
fi

all_changed="$(collect_changed_files)"
level="$(resolve_quality_gate_level "${all_changed}")"

if quality_gate_should_print_step; then
  echo "[quality-gate-fast] selected level: ${level}"
fi

if [[ -f "scripts/check-ui-copy-guard.mjs" ]]; then
  run_quality_gate_script "quality-gate-fast" "${pm}" "copy:guard"
fi

if [[ -f "scripts/check-repository-root-boundary.mjs" ]]; then
  run_quality_gate_command \
    "quality-gate-fast" \
    "repository-root-boundary" \
    "repository root boundary" \
    node scripts/check-repository-root-boundary.mjs
fi

if [[ -f "scripts/check-layer-dependency-boundary.mjs" ]]; then
  run_quality_gate_command \
    "quality-gate-fast" \
    "layer-dependency-boundary" \
    "layer dependency boundary" \
    node scripts/check-layer-dependency-boundary.mjs
fi

if [[ "${level}" == "full" ]]; then
  exec bash "${SCRIPT_DIR}/quality-gate-target.sh" full
fi

if [[ "${level}" == "android" ]]; then
  exec bash "${SCRIPT_DIR}/quality-gate-target.sh" android
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
    run_parallel_lint_and_typecheck "full lint" ""
  else
    run_parallel_lint_and_typecheck "scoped lint" "${lint_targets}"
  fi
fi

echo "[quality-gate-fast] all checks passed."
