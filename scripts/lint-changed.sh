#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

collect_changed_files() {
  local staged unstaged untracked
  if [[ -n "${LINT_CHANGED_FILES:-}" ]]; then
    printf '%s\n' "${LINT_CHANGED_FILES}" | grep -v '^\s*$' | sort -u || true
    return 0
  fi

  staged="$(git diff --cached --name-only --diff-filter=ACMR -- . 2>/dev/null || true)"
  unstaged="$(git diff --name-only --diff-filter=ACMR -- . 2>/dev/null || true)"
  untracked="$(git ls-files --others --exclude-standard -- . 2>/dev/null || true)"

  printf '%s\n%s\n%s\n' "${staged}" "${unstaged}" "${untracked}" | grep -v '^\s*$' | sort -u || true
}

scope=""
if [[ "${1:-}" == "--scope" ]]; then
  scope="${2:-}"
  if [[ -z "${scope}" ]]; then
    echo "[lint-changed] --scope requires a value"
    exit 1
  fi
  shift 2
fi

filter_by_scope() {
  case "${scope}" in
    "")
      cat
      ;;
    desktop|android|shared)
      node "${SCRIPT_DIR}/lib/path-domains.mjs" lint-scope "${scope}" || true
      ;;
    *)
      echo "[lint-changed] unknown scope: ${scope}" >&2
      exit 1
      ;;
  esac
}

collect_lint_targets() {
  if [[ "$#" -gt 0 ]]; then
    printf '%s\n' "$@" | grep -E '\.(js|jsx|ts|tsx|cjs|mjs)$' | filter_by_scope | grep -v '^\s*$' || true
    return 0
  fi

  collect_changed_files | grep -E '\.(js|jsx|ts|tsx|cjs|mjs)$' | filter_by_scope | grep -v '^\s*$' || true
}

lint_targets="$(collect_lint_targets "$@")"
if [[ -z "${lint_targets}" ]]; then
  if [[ -n "${scope}" ]]; then
    echo "[lint-changed] no lintable changed files detected for scope: ${scope}"
  else
    echo "[lint-changed] no lintable changed files detected"
  fi
  exit 0
fi

mapfile -t lint_array <<< "${lint_targets}"
./node_modules/.bin/eslint --cache --cache-location .tmp/eslint-cache/changed/ "${lint_array[@]}"
