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

has_quality_gate_arg() {
  local expected="$1"
  shift || true
  local arg
  for arg in "$@"; do
    [[ "${arg}" == "${expected}" ]] && return 0
  done
  return 1
}

collect_changed_files() {
  if [[ -n "${QUALITY_GATE_CHANGED_FILES:-}" ]]; then
    printf '%s\n' "${QUALITY_GATE_CHANGED_FILES}" | grep -v '^\s*$' | sort -u || true
    return 0
  fi

  local staged unstaged untracked
  staged="$(git diff --cached --name-only --diff-filter=ACMR -- . 2>/dev/null || true)"
  unstaged="$(git diff --name-only --diff-filter=ACMR -- . 2>/dev/null || true)"
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

resolve_quality_gate_route() {
  local changed="$1"

  if [[ -z "${changed}" ]]; then
    printf 'light\tno changed files detected'
    return 0
  fi

  if ! printf '%s\n' "${changed}" | grep -E -v '\.(test|spec)\.[^.]+$' >/dev/null; then
    printf 'mid\ttest files changed'
    return 0
  fi

  if printf '%s\n' "${changed}" | grep -E -q '^(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?$)'; then
    printf 'full\tdependency root changed'
    return 0
  fi

  if printf '%s\n' "${changed}" | grep -E -q '^electron/'; then
    printf 'desktop\tdesktop runtime changed'
    return 0
  fi

  if printf '%s\n' "${changed}" | grep -E -q '^(lib/|src/store/|src/shared/platform/)'; then
    printf 'shared\tshared runtime or store changed'
    return 0
  fi

  if printf '%s\n' "${changed}" | grep -E '^scripts/' | grep -E -v -q '^scripts/android/'; then
    printf 'mid\tnon-Android script changed'
    return 0
  fi

  if printf '%s\n' "${changed}" | grep -E -q '^(android/|scripts/android/|src/companion/|capacitor\.config\.ts$|vite\.companion\.config\.ts$)'; then
    printf 'android\tandroid or companion path changed'
    return 0
  fi

  local file_path base_name
  while IFS= read -r file_path; do
    [[ -z "${file_path}" ]] && continue
    [[ "${file_path}" =~ \.(test|spec)\.[^.]+$ ]] && continue
    if [[ "${file_path}" =~ ^src/shared/ui/ ]]; then
      printf 'mid\tshared UI surface changed'
      return 0
    fi
    if [[ "${file_path}" =~ ^src/(features/|app/components/) ]]; then
      base_name="$(basename "${file_path}")"
      if [[ "${base_name}" =~ ^index\.(ts|tsx)$ || "${base_name}" =~ types?\.[^.]+$ ]] || diff_has_mid_scope_signature "${file_path}"; then
        printf 'mid\texported component surface or props/type signature changed'
        return 0
      fi
    fi
  done <<< "${changed}"

  printf 'light\tlocal source change'
}

resolve_quality_gate_level() {
  local changed="$1"
  resolve_quality_gate_route "${changed}" | cut -f1
}

resolve_quality_gate_level_reason() {
  local changed="$1"
  resolve_quality_gate_route "${changed}" | cut -f2-
}

collect_lint_targets() {
  local changed="$1"
  printf '%s\n' "${changed}" | grep -E '\.(js|jsx|ts|tsx|cjs|mjs)$' | grep -v '^\s*$' || true
}

collect_related_test_files() {
  local changed="$1"
  local source_changed direct_tests source_files inferred_tests

  source_changed="$(printf '%s\n' "${changed}" | grep -E '^(src/|electron/|scripts/|lib/).*\.(ts|tsx|js|jsx|mjs|cjs|sh)$' || true)"
  if [[ -z "${source_changed}" ]]; then
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
      for ext in test.ts test.tsx test.js test.jsx test.mjs test.cjs spec.ts spec.tsx spec.js spec.jsx spec.mjs spec.cjs; do
        candidate="${dir}/${stem}.${ext}"
        if [[ -f "${candidate}" ]]; then
          inferred_tests="${inferred_tests}${candidate}"$'\n'
        fi
      done
    done <<< "${source_files}"
  fi

  printf '%s\n%s' "${direct_tests}" "${inferred_tests}" | grep -v '^\s*$' | sort -u || true
}

print_quality_gate_route_plan() {
  local changed="$1"
  local level="$2"
  local reason lint_targets related_tests

  reason="$(resolve_quality_gate_level_reason "${changed}")"
  lint_targets="$(collect_lint_targets "${changed}")"
  related_tests="$(collect_related_test_files "${changed}")"

  echo "[quality-gate-route] selected level: ${level}"
  echo "[quality-gate-route] reason: ${reason}"
  case "${level}" in
    full)
      echo "[quality-gate-route] target: quality:full"
      ;;
    desktop)
      echo "[quality-gate-route] target: quality:desktop"
      ;;
    shared)
      echo "[quality-gate-route] target: quality:shared"
      ;;
    android)
      echo "[quality-gate-route] target: quality:android"
      ;;
    mid)
      echo "[quality-gate-route] target: scoped lint + typecheck + workspace boundary + related tests"
      ;;
    *)
      if [[ -z "${changed}" ]]; then
        echo "[quality-gate-route] target: typecheck only"
      else
        echo "[quality-gate-route] target: scoped lint + typecheck"
      fi
      ;;
  esac

  if [[ -n "${changed}" ]]; then
    echo "[quality-gate-route] changed files:"
    echo "${changed}" | sed 's/^/[quality-gate-route]   /'
  else
    echo "[quality-gate-route] changed files: none"
  fi

  if [[ -n "${lint_targets}" ]]; then
    echo "[quality-gate-route] lint targets:"
    echo "${lint_targets}" | sed 's/^/[quality-gate-route]   /'
  else
    echo "[quality-gate-route] lint targets: none"
  fi

  if [[ -n "${related_tests}" ]]; then
    echo "[quality-gate-route] related tests:"
    echo "${related_tests}" | sed 's/^/[quality-gate-route]   /'
  else
    echo "[quality-gate-route] related tests: none"
  fi
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

  mapfile -t test_array <<< "${test_files}"
  run_quality_gate_command \
    "quality-gate-fast" \
    "test" \
    "test (related)" \
    npx vitest run --reporter=dot --silent=passed-only --pool=threads --no-file-parallelism "${test_array[@]}"
}

if quality_gate_should_print_step && ! has_quality_gate_arg "--route" "$@"; then
  echo "[quality-gate-fast] detected package manager: ${pm}"
fi

if has_quality_gate_arg "--full" "$@"; then
  if quality_gate_should_print_step; then
    echo "[quality-gate-fast] forcing full quality gate"
  fi
  exec bash "${SCRIPT_DIR}/quality-gate-target.sh" full
fi

if has_quality_gate_arg "--release" "$@"; then
  if quality_gate_should_print_step; then
    echo "[quality-gate-fast] forcing release quality gate"
  fi
  exec bash "${SCRIPT_DIR}/quality-gate-target.sh" release
fi

all_changed="$(collect_changed_files)"
level="$(resolve_quality_gate_level "${all_changed}")"

if has_quality_gate_arg "--route" "$@"; then
  print_quality_gate_route_plan "${all_changed}" "${level}"
  exit 0
fi

if quality_gate_should_print_step; then
  echo "[quality-gate-fast] selected level: ${level}"
fi

if [[ "${level}" == "full" ]]; then
  exec bash "${SCRIPT_DIR}/quality-gate-target.sh" full
fi

if [[ "${level}" == "desktop" ]]; then
  exec bash "${SCRIPT_DIR}/quality-gate-target.sh" desktop
fi

if [[ "${level}" == "shared" ]]; then
  exec bash "${SCRIPT_DIR}/quality-gate-target.sh" shared
fi

if [[ "${level}" == "android" ]]; then
  exec bash "${SCRIPT_DIR}/quality-gate-target.sh" android
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
[[ ! -f "scripts/quality-skip-lint.mjs" ]] || run_quality_gate_command "quality-gate-fast" "quality-skip-lint" "quality skip lint" node scripts/quality-skip-lint.mjs

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
  fi
fi

echo "[quality-gate-fast] all checks passed."
