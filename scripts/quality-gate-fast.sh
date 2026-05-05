#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/quality-gate-lib.sh"

if [[ ! -f "package.json" ]]; then
  echo "[quality-gate-fast] package.json not found."
  exit 1
fi

pm="$(resolve_package_manager)"

if quality_gate_should_print_step; then
  echo "[quality-gate-fast] detected package manager: ${pm}"
fi

# --- parallel: lint + typecheck ------------------------------------------------
lint_log="$(mktemp)"
typecheck_log="$(mktemp)"

if quality_gate_should_print_step; then
  echo "[quality-gate-fast] running: lint + typecheck (parallel)"
fi

(run_quality_gate_script "quality-gate-fast" "${pm}" "lint" >"${lint_log}" 2>&1) &
lint_pid=$!
(run_quality_gate_script "quality-gate-fast" "${pm}" "typecheck" >"${typecheck_log}" 2>&1) &
typecheck_pid=$!

lint_ok=0
typecheck_ok=0
set +e
wait "${lint_pid}"; lint_ok=$?
wait "${typecheck_pid}"; typecheck_ok=$?
set -e

if [[ "${lint_ok}" -ne 0 ]]; then
  echo "[quality-gate-fast] lint failed:"
  cat "${lint_log}"
fi
if [[ "${typecheck_ok}" -ne 0 ]]; then
  echo "[quality-gate-fast] typecheck failed:"
  cat "${typecheck_log}"
fi

rm -f "${lint_log}" "${typecheck_log}"

if [[ "${lint_ok}" -ne 0 || "${typecheck_ok}" -ne 0 ]]; then
  exit 1
fi

if quality_gate_should_print_step; then
  echo "[quality-gate-fast] passed: lint + typecheck"
fi

# --- test: only tests related to changed files ---------------------------------
# Collect changed + untracked files (staged, unstaged, untracked).
changed_files="$(git diff --name-only HEAD -- 'src/' 'electron/' 'scripts/' 2>/dev/null || true)"
untracked_files="$(git ls-files --others --exclude-standard -- 'src/' 'electron/' 'scripts/' 2>/dev/null || true)"
all_changed="$(printf '%s\n%s' "${changed_files}" "${untracked_files}" | grep -E '\.(ts|tsx|mjs)$' | grep -v '^\s*$' | sort -u || true)"

if [[ -z "${all_changed}" ]]; then
  if quality_gate_should_print_step; then
    echo "[quality-gate-fast] no source changes detected — skipping tests"
  fi
else
  # 1) Directly changed test files
  direct_tests="$(echo "${all_changed}" | grep -E '\.(test|spec)\.' || true)"

  # 2) For changed source files, find co-located test files by name convention
  #    e.g. foo.ts -> foo.test.ts, Bar.tsx -> Bar.test.tsx
  source_files="$(echo "${all_changed}" | grep -vE '\.(test|spec)\.' || true)"
  inferred_tests=""
  if [[ -n "${source_files}" ]]; then
    while IFS= read -r src_file; do
      dir="$(dirname "${src_file}")"
      base="$(basename "${src_file}")"
      # Strip extension, try .test.ts and .test.tsx
      stem="${base%.*}"
      for ext in test.ts test.tsx; do
        candidate="${dir}/${stem}.${ext}"
        if [[ -f "${candidate}" ]]; then
          inferred_tests="${inferred_tests}${candidate}"$'\n'
        fi
      done
    done <<< "${source_files}"
  fi

  # Merge and deduplicate
  test_files="$(printf '%s\n%s' "${direct_tests}" "${inferred_tests}" | grep -v '^\s*$' | sort -u || true)"

  if [[ -z "${test_files}" ]]; then
    if quality_gate_should_print_step; then
      echo "[quality-gate-fast] changes detected but no related tests found — skipping tests"
    fi
  else
    count="$(echo "${test_files}" | wc -l | tr -d ' ')"
    if quality_gate_should_print_step; then
      echo "[quality-gate-fast] running: ${count} related test file(s)"
      echo "${test_files}" | sed 's/^/  /'
    fi

    # Pass test files as positional filters to vitest
    mapfile -t test_array <<< "${test_files}"
    npx vitest run --pool=threads "${test_array[@]}"

    if quality_gate_should_print_step; then
      echo "[quality-gate-fast] passed: test (related)"
    fi
  fi
fi

echo "[quality-gate-fast] all checks passed."
