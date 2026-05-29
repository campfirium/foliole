#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WINDOWS_MIRROR_DIR="${WINDOWS_MIRROR_DIR:-/mnt/d/C/foliole}"
WINDOWS_SYNC_CHANGE_LOG="${WINDOWS_SYNC_CHANGE_LOG:-}"
WINDOWS_SYNC_CHANGED_FILES="${WINDOWS_SYNC_CHANGED_FILES:-}"
WINDOWS_SYNC_FORCE_FULL="${WINDOWS_SYNC_FORCE_FULL:-}"
WINDOWS_SYNC_INCLUDE_ELECTRON_DIST="${WINDOWS_SYNC_INCLUDE_ELECTRON_DIST:-}"
WINDOWS_SYNC_LOCK_FILE="${WINDOWS_SYNC_LOCK_FILE:-/tmp/foliole-windows-mirror.lock}"
WINDOWS_SYNC_STAMP_FILE="${WINDOWS_SYNC_STAMP_FILE:-.lab/internal/runtime/windows-sync.stamp}"
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

sync_mode="full"
if [[ -z "${WINDOWS_SYNC_FORCE_FULL}" && -n "${WINDOWS_SYNC_CHANGED_FILES}" && -f "${WINDOWS_SYNC_STAMP_FILE}" ]]; then
  sync_mode="changed-files"
fi

if [[ "${sync_mode}" = "full" ]]; then
  rm -rf "${WINDOWS_MIRROR_DIR}/trees"
fi

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
  --exclude ".windows-native-window-visible.json"
  --exclude ".windows-native-client-state.json"
  --exclude ".windows-dev-restart-intent.json"
  --exclude ".windows-dev-restart-delivered.json"
  --exclude ".windows-dev-renderer-reload-intent.json"
  --exclude ".windows-dev-renderer-reload-delivered.json"
  --exclude ".windows-dev-shell-restart-request.json"
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

run_rsync() {
  if [[ -n "${WINDOWS_SYNC_CHANGE_LOG}" ]]; then
    : > "${WINDOWS_SYNC_CHANGE_LOG}"
    rsync "$@" | tee "${WINDOWS_SYNC_CHANGE_LOG}"
  else
    rsync "$@"
  fi
}

write_sync_stamp() {
  mkdir -p "$(dirname "${WINDOWS_SYNC_STAMP_FILE}")"
  touch "${WINDOWS_SYNC_STAMP_FILE}"
}

if [[ "${sync_mode}" = "changed-files" ]]; then
  changed_file_list="$(mktemp)"
  trap 'rm -f "${changed_file_list:-}"' EXIT
  while IFS= read -r file_path; do
    [[ -z "${file_path}" ]] && continue
    [[ "${file_path}" = /* || "${file_path}" = *".."* ]] && continue
    [[ -f "${REPO_ROOT}/${file_path}" ]] || continue
    printf '%s\n' "${file_path}" >> "${changed_file_list}"
  done <<< "${WINDOWS_SYNC_CHANGED_FILES}"
  if [[ ! -s "${changed_file_list}" ]]; then
    echo "[windows-sync] status: SYNCED mode=changed-files files=0"
    write_sync_stamp
    exit 0
  fi
  changed_file_count="$(wc -l < "${changed_file_list}" | tr -d '[:space:]')"
  echo "[windows-sync] mode: changed-files files=${changed_file_count}"
  RSYNC_CHANGED_BASE_ARGS=()
  for arg in "${RSYNC_ARGS[@]}"; do
    [[ "${arg}" = "--delete" ]] && continue
    RSYNC_CHANGED_BASE_ARGS+=("${arg}")
  done
  RSYNC_CHANGED_ARGS=("${RSYNC_CHANGED_BASE_ARGS[@]}" --files-from="${changed_file_list}" "${REPO_ROOT}/" "${WINDOWS_MIRROR_DIR}/")
  run_rsync "${RSYNC_CHANGED_ARGS[@]}"
  write_sync_stamp
  echo "[windows-sync] status: SYNCED mode=changed-files files=${changed_file_count}"
  exit 0
fi

if [[ -n "${WINDOWS_SYNC_CHANGE_LOG}" ]]; then
  : > "${WINDOWS_SYNC_CHANGE_LOG}"
  rsync "${RSYNC_ARGS[@]}" "${REPO_ROOT}/" "${WINDOWS_MIRROR_DIR}/" | tee "${WINDOWS_SYNC_CHANGE_LOG}"
else
  rsync "${RSYNC_ARGS[@]}" "${REPO_ROOT}/" "${WINDOWS_MIRROR_DIR}/"
fi

write_sync_stamp
echo "[windows-sync] status: SYNCED"
