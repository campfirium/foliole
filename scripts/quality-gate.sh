#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f "package.json" ]]; then
  echo "[quality-gate] package.json not found."
  echo "[quality-gate] Create project baseline first (lint/typecheck/test/build scripts)."
  exit 1
fi

pm="npm"
if [[ -f "pnpm-lock.yaml" ]]; then
  pm="pnpm"
elif [[ -f "bun.lockb" || -f "bun.lock" ]]; then
  pm="bun"
elif [[ -f "yarn.lock" ]]; then
  pm="yarn"
fi

has_script() {
  local script_name="$1"
  node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts['$script_name'] ? 0 : 1)"
}

run_if_exists() {
  local script_name="$1"
  if has_script "$script_name"; then
    if [[ "$pm" == "yarn" ]]; then
      echo "[quality-gate] running: yarn ${script_name}"
      yarn "${script_name}"
    else
      echo "[quality-gate] running: ${pm} run ${script_name}"
      "${pm}" run "${script_name}"
    fi
  else
    echo "[quality-gate] missing script: ${script_name}"
    exit 1
  fi
}

echo "[quality-gate] detected package manager: ${pm}"
run_if_exists "lint"
run_if_exists "typecheck"
run_if_exists "test"
run_if_exists "build"

echo "[quality-gate] all checks passed."
