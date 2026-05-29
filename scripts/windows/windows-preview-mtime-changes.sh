#!/usr/bin/env bash

resolve_changed_files() {
  if [ -n "${WINDOWS_PREVIEW_CHANGED_FILES:-}" ]; then
    printf '%s' "${WINDOWS_PREVIEW_CHANGED_FILES}"
    return 0
  fi
  local stamp_file="${WINDOWS_PREVIEW_SYNC_STAMP_FILE:-.lab/internal/runtime/windows-sync.stamp}"
  local freshness_filter=()
  if [ -f "${stamp_file}" ]; then
    freshness_filter=(-newer "${stamp_file}")
  fi
  find . \
    \( \
      -path './.git' -o \
      -path './.lab' -o \
      -path './.tmp' -o \
      -path './.tmp-*' -o \
      -path './.tmp-vitest' -o \
      -path './.tmp-vitest-*' -o \
      -path './.tmp-npm' -o \
      -path './node_modules' -o \
      -path './dist' -o \
      -path './release' -o \
      -path './coverage' -o \
      -path './electron-dist' -o \
      -path './android/.gradle' -o \
      -path './android/build' -o \
      -path './android/app/build' -o \
      -path './android/capacitor-cordova-android-plugins/build' -o \
      -path './playwright-report' -o \
      -path './test-results' -o \
      -path './blob-report' -o \
      -path './logs' \
    \) -prune -o -type f "${freshness_filter[@]}" -print |
    sed 's#^\./##' |
    sort -u
}
