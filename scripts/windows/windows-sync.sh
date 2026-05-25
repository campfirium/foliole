#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WINDOWS_MIRROR_DIR="${WINDOWS_MIRROR_DIR:-/mnt/d/C/foliole}"
WINDOWS_SYNC_CHANGE_LOG="${WINDOWS_SYNC_CHANGE_LOG:-}"
WINDOWS_SYNC_INCLUDE_ELECTRON_DIST="${WINDOWS_SYNC_INCLUDE_ELECTRON_DIST:-}"
WINDOWS_SYNC_LOCK_FILE="${WINDOWS_SYNC_LOCK_FILE:-/tmp/foliole-windows-mirror.lock}"
WINDOWS_SYNC_VERBOSE="${WINDOWS_SYNC_VERBOSE:-}"

if [[ ! -d "${WINDOWS_MIRROR_DIR}" ]]; then
  echo "[windows-sync] mirror directory not found: ${WINDOWS_MIRROR_DIR}"
  echo "[windows-sync] set WINDOWS_MIRROR_DIR or create D:\\C\\foliole first."
  exit 1
fi

if [[ "${REPO_ROOT}" == "${WINDOWS_MIRROR_DIR}" ]]; then
  echo "[windows-sync] source and target are the same directory; skip."
  exit 0
fi

echo "[windows-sync] source: ${REPO_ROOT}"
echo "[windows-sync] target: ${WINDOWS_MIRROR_DIR}"

if command -v flock >/dev/null 2>&1; then
  exec 9>"${WINDOWS_SYNC_LOCK_FILE}"
  echo "[windows-sync] waiting for lock: ${WINDOWS_SYNC_LOCK_FILE}"
  flock 9
  echo "[windows-sync] lock acquired"
fi

rm -rf "${WINDOWS_MIRROR_DIR}/trees"

RSYNC_ARGS=(
  -rlt
  --inplace
  --delete
  --no-perms
  --no-owner
  --no-group
  --exclude ".claude/"
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
  --exclude "trees/"
  --exclude "src-tauri/"
  --exclude "node_modules/"
  --exclude "dist/"
  --exclude "release/"
  --exclude "coverage/"
  --exclude "android/.gradle/"
  --exclude "android/build/"
  --exclude "android/app/build/"
  --exclude "android/app/src/main/assets/public/"
  --exclude "android/app/src/main/assets/capacitor.config.json"
  --exclude "android/app/src/main/assets/capacitor.plugins.json"
  --exclude "android/app/src/main/res/xml/config.xml"
  --exclude "android/app/capacitor.build.gradle"
  --exclude "android/capacitor.settings.gradle"
  --exclude "android/capacitor-cordova-android-plugins/"
  --exclude "android/capacitor-cordova-android-plugins/build/"
  --exclude "playwright-report/"
  --exclude "test-results/"
  --exclude "blob-report/"
  --exclude "logs/"
)

if [[ -z "${WINDOWS_SYNC_INCLUDE_ELECTRON_DIST}" ]]; then
  RSYNC_ARGS+=(--exclude "electron-dist/")
fi

if [[ -n "${WINDOWS_SYNC_VERBOSE}" || -n "${WINDOWS_SYNC_CHANGE_LOG}" ]]; then
  RSYNC_ARGS+=(--itemize-changes)
fi

if [[ -n "${WINDOWS_SYNC_CHANGE_LOG}" ]]; then
  : > "${WINDOWS_SYNC_CHANGE_LOG}"
  rsync "${RSYNC_ARGS[@]}" "${REPO_ROOT}/" "${WINDOWS_MIRROR_DIR}/" | tee "${WINDOWS_SYNC_CHANGE_LOG}"
else
  rsync "${RSYNC_ARGS[@]}" "${REPO_ROOT}/" "${WINDOWS_MIRROR_DIR}/"
fi

echo "[windows-sync] status: SYNCED"
