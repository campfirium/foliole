#!/usr/bin/env bash
set -euo pipefail

collect_changed_files() {
  local staged unstaged untracked
  staged="$(git diff --cached --name-only -- . 2>/dev/null || true)"
  unstaged="$(git diff --name-only -- . 2>/dev/null || true)"
  untracked="$(git ls-files --others --exclude-standard -- . 2>/dev/null || true)"

  printf '%s\n%s\n%s\n' "${staged}" "${unstaged}" "${untracked}" | grep -v '^\s*$' | sort -u || true
}

collect_lint_targets() {
  if [[ "$#" -gt 0 ]]; then
    printf '%s\n' "$@" | grep -E '\.(js|jsx|ts|tsx|cjs|mjs)$' | grep -v '^\s*$' || true
    return 0
  fi

  collect_changed_files | grep -E '\.(js|jsx|ts|tsx|cjs|mjs)$' | grep -v '^\s*$' || true
}

lint_targets="$(collect_lint_targets "$@")"
if [[ -z "${lint_targets}" ]]; then
  echo "[lint-changed] no lintable changed files detected"
  exit 0
fi

mapfile -t lint_array <<< "${lint_targets}"
./node_modules/.bin/eslint "${lint_array[@]}"
