#!/usr/bin/env bash

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

  if [[ -n "$(collect_critical_test_files "${changed}")" ]]; then
    printf 'mid\tcritical test route changed'
    return 0
  fi

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

collect_critical_test_files() {
  local changed="$1"
  if [[ -z "${changed}" || ! -f "scripts/quality-critical-test-routes.mjs" ]]; then
    return 0
  fi
  printf '%s\n' "${changed}" | node scripts/quality-critical-test-routes.mjs 2>/dev/null || true
}

collect_related_test_files() {
  local changed="$1"
  local source_changed direct_tests source_files inferred_tests critical_tests

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

  critical_tests="$(collect_critical_test_files "${changed}")"
  printf '%s\n%s\n%s' "${direct_tests}" "${inferred_tests}" "${critical_tests}" | grep -v '^\s*$' | sort -u || true
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
