#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"

if ! command -v codex >/dev/null 2>&1; then
  echo "[codex-task] codex not found in PATH. Manually install the @openai/codex CLI so the 'codex' command is available, then rerun."
  exit 1
fi

node "${SCRIPT_DIR}/codex-task.mjs" "$@"
