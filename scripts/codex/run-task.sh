#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"

if ! command -v npm >/dev/null 2>&1; then
  echo "[codex-task] npm not found in WSL PATH."
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "[codex-task] codex not found; installing @openai/codex via npm."
  npm install -g @openai/codex --no-audit --no-fund
fi

node "${SCRIPT_DIR}/codex-task.mjs" "$@"
