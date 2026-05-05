#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WINDOWS_MIRROR_DIR="${WINDOWS_MIRROR_DIR:-/mnt/c/dev/foliole}"
WINDOWS_SYNC_CHANGE_LOG="${WINDOWS_SYNC_CHANGE_LOG:-}"
WINDOWS_SYNC_INCLUDE_ELECTRON_DIST="${WINDOWS_SYNC_INCLUDE_ELECTRON_DIST:-}"

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

RSYNC_ARGS=(
  -rlt
  --inplace
  --delete
  --itemize-changes
  --no-perms
  --no-owner
  --no-group
  --exclude ".git/"
  --exclude ".lab/"
  --exclude ".tmp/"
  --exclude ".tmp-*/"
  --exclude ".tmp-vitest/"
  --exclude ".tmp-vitest-*/"
  --exclude ".tmp-npm/"
  --exclude ".windows-native-boot-ready.json"
  --exclude ".windows-native-bridge-ready.json"
  --exclude "ref/"
  --exclude "src-tauri/"
  --exclude "node_modules/"
  --exclude "dist/"
  --exclude "release/"
  --exclude "coverage/"
  --exclude "android/.gradle/"
  --exclude "android/build/"
  --exclude "android/app/build/"
  --exclude "android/capacitor-cordova-android-plugins/build/"
  --exclude "playwright-report/"
  --exclude "test-results/"
  --exclude "blob-report/"
  --exclude "logs/"
)

if [[ -z "${WINDOWS_SYNC_INCLUDE_ELECTRON_DIST}" ]]; then
  RSYNC_ARGS+=(--exclude "electron-dist/")
fi

if [[ -n "${WINDOWS_SYNC_CHANGE_LOG}" ]]; then
  : > "${WINDOWS_SYNC_CHANGE_LOG}"
  rsync "${RSYNC_ARGS[@]}" "${REPO_ROOT}/" "${WINDOWS_MIRROR_DIR}/" | tee "${WINDOWS_SYNC_CHANGE_LOG}"
else
  rsync "${RSYNC_ARGS[@]}" "${REPO_ROOT}/" "${WINDOWS_MIRROR_DIR}/"
fi

echo "[windows-sync] status: SYNCED"
