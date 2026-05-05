#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WINDOWS_MIRROR_DIR="${WINDOWS_MIRROR_DIR:-/mnt/c/dev/foliole}"

if [[ ! -d "${WINDOWS_MIRROR_DIR}" ]]; then
  echo "[windows-sync] mirror directory not found: ${WINDOWS_MIRROR_DIR}"
  echo "[windows-sync] set WINDOWS_MIRROR_DIR or create C:\\dev\\foliole first."
  exit 1
fi

if [[ "${REPO_ROOT}" == "${WINDOWS_MIRROR_DIR}" ]]; then
  echo "[windows-sync] source and target are the same directory; skip."
  exit 0
fi

echo "[windows-sync] source: ${REPO_ROOT}"
echo "[windows-sync] target: ${WINDOWS_MIRROR_DIR}"

rsync -a --delete \
  --exclude ".git/" \
  --exclude ".lab/" \
  --exclude "ref/" \
  --exclude "node_modules/" \
  --exclude "dist/" \
  --exclude "coverage/" \
  --exclude "playwright-report/" \
  --exclude "test-results/" \
  --exclude "blob-report/" \
  --exclude "logs/" \
  --exclude "src-tauri/target/" \
  "${REPO_ROOT}/" "${WINDOWS_MIRROR_DIR}/"

echo "[windows-sync] status: SYNCED"
