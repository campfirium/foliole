#!/usr/bin/env bash

QUALITY_GATE_ROUTING_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QUALITY_PATH_DOMAINS_SCRIPT="${QUALITY_PATH_DOMAINS_SCRIPT:-${QUALITY_GATE_ROUTING_DIR}/../lib/path-domains.mjs}"

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
  staged="$(git diff --cached --name-only --diff-filter=ACMRD -- . 2>/dev/null || true)"
  unstaged="$(git diff --name-only --diff-filter=ACMRD -- . 2>/dev/null || true)"
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
  local critical_tests static_route

  if ! static_route="$(printf '%s\n' "${changed}" | node "${QUALITY_PATH_DOMAINS_SCRIPT}" quality-route)"; then
    echo "[quality-gate-route] path domain resolution failed" >&2
    return 1
  fi
  if [[ -n "${static_route}" ]]; then
    printf '%s' "${static_route}"
    return 0
  fi

  local file_path base_name
  while IFS= read -r file_path; do
    [[ -z "${file_path}" ]] && continue
    [[ "${file_path}" =~ \.(test|spec)\.[^.]+$ ]] && continue
    if [[ "${file_path}" =~ ^src/(features/|app/components/) ]]; then
      base_name="$(basename "${file_path}")"
      if [[ "${base_name}" =~ ^index\.(ts|tsx)$ || "${base_name}" =~ types?\.[^.]+$ ]] || diff_has_mid_scope_signature "${file_path}"; then
        printf 'mid\texported component surface or props/type signature changed'
        return 0
      fi
    fi
  done <<< "${changed}"

  if ! critical_tests="$(collect_critical_test_files "${changed}")"; then
    return 1
  fi
  if [[ -n "${critical_tests}" ]]; then
    printf 'mid\tcritical test route changed'
    return 0
  fi

  printf 'light\tlocal source change'
}

resolve_quality_gate_level() {
  local changed="$1"
  local route
  if ! route="$(resolve_quality_gate_route "${changed}")"; then return 1; fi
  printf '%s\n' "${route}" | cut -f1
}

resolve_quality_gate_level_reason() {
  local changed="$1"
  local route
  if ! route="$(resolve_quality_gate_route "${changed}")"; then return 1; fi
  printf '%s\n' "${route}" | cut -f2-
}

resolve_quality_gate_target() {
  local level="$1"
  local changed="$2"
  case "${level}" in
    full)
      printf 'quality:full'
      ;;
    desktop)
      printf 'quality:desktop'
      ;;
    shared)
      printf 'quality:shared'
      ;;
    android)
      printf 'quality:android'
      ;;
    ios)
      printf 'quality:ios:contract'
      ;;
    mid)
      printf 'scoped lint + typecheck + workspace boundary + related tests'
      ;;
    *)
      if [[ -z "${changed}" ]]; then
        printf 'typecheck only'
      else
        printf 'scoped lint + typecheck + related tests when present'
      fi
      ;;
  esac
}

collect_lint_targets() {
  local changed="$1"
  printf '%s\n' "${changed}" | grep -E '\.(js|jsx|ts|tsx|cjs|mjs)$' | filter_existing_files || true
}

filter_existing_files() {
  local file_path
  while IFS= read -r file_path; do
    [[ -n "${file_path}" && -f "${file_path}" ]] && printf '%s\n' "${file_path}"
  done
}

collect_critical_test_files() {
  local changed="$1"
  if [[ -z "${changed}" ]]; then
    return 0
  fi
  if [[ ! -f "scripts/quality/quality-critical-test-routes.mjs" ]]; then
    echo "[quality-gate-route] critical test resolver is missing" >&2
    return 1
  fi
  printf '%s\n' "${changed}" | node scripts/quality/quality-critical-test-routes.mjs
}

quality_skip_lint_changed_files_match() {
  local changed="$1"
  [[ -n "${changed}" ]] || return 1
  printf '%s\n' "${changed}" | grep -E -q '(^scripts/quality/quality-skip-lint\.mjs$|\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$)'
}

quality_skip_lint_target_requires_full_scan() {
  case "$1" in
    desktop-static|full|release|release-core|release-tests|release-tooling)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

collect_related_test_files() {
  local changed="$1"
  local source_changed direct_tests source_files inferred_tests critical_tests

  if ! critical_tests="$(collect_critical_test_files "${changed}")"; then return 1; fi
  source_changed="$(printf '%s\n' "${changed}" | grep -E '^(src/|electron/|scripts/|lib/).*\.(ts|tsx|js|jsx|mjs|cjs|sh)$' || true)"
  if [[ -z "${source_changed}" ]]; then
    printf '%s\n' "${critical_tests}" | grep -v '^\s*$' | sort -u || true
    return 0
  fi

  direct_tests="$(echo "${source_changed}" | grep -E '\.(test|spec)\.' | filter_existing_files || true)"
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

  printf '%s\n%s\n%s' "${direct_tests}" "${inferred_tests}" "${critical_tests}" | grep -v '^\s*$' | sort -u || true
}

print_quality_gate_route_plan() {
  local changed="$1"
  local level="$2"
  local reason lint_targets related_tests

  if ! reason="$(resolve_quality_gate_level_reason "${changed}")"; then return 1; fi
  lint_targets="$(collect_lint_targets "${changed}")"
  if ! related_tests="$(collect_related_test_files "${changed}")"; then return 1; fi

  echo "[quality-gate-route] selected level: ${level}"
  echo "[quality-gate-route] reason: ${reason}"
  echo "[quality-gate-route] target: $(resolve_quality_gate_target "${level}" "${changed}")"

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
