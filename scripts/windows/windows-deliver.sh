#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"

echo "[windows-deliver] step 1/2: quality gate"
bash scripts/quality-gate.sh

echo "[windows-deliver] step 2/2: sync to windows mirror"
bash scripts/windows/windows-sync.sh

echo "[windows-deliver] client startup is manual on Windows: run npm run electron:dev in C:\\dev\\foliole"
echo "[windows-deliver] status: DELIVERED"
