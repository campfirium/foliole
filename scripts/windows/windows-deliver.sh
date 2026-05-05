#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"

echo "[windows-deliver] step 1/3: quality gate"
bash scripts/quality-gate.sh

echo "[windows-deliver] step 2/3: sync to windows mirror"
bash scripts/windows/windows-sync.sh

echo "[windows-deliver] step 3/3: restart windows client"
WINDOWS_CLIENT_ACTION=restart bash scripts/windows/windows-restart-client.sh

echo "[windows-deliver] status: DELIVERED"
