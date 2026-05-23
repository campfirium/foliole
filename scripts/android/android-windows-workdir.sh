#!/usr/bin/env bash

android_windows_path_to_shell_path() {
  local host_path="$1"
  if [[ "${host_path}" =~ ^([A-Za-z]):[\\/] ]]; then
    if command -v wslpath >/dev/null 2>&1; then
      wslpath -u "${host_path}"
      return
    fi
    if command -v cygpath >/dev/null 2>&1; then
      cygpath -u "${host_path}"
      return
    fi
    local drive="${BASH_REMATCH[1],,}"
    echo "/${drive}${host_path:2}" | tr '\\' '/'
    return
  fi
  echo "${host_path}"
}

android_shell_path_to_windows_path() {
  local shell_path="$1"
  if [[ "${shell_path}" =~ ^[A-Za-z]:[\\/] ]]; then
    echo "${shell_path}"
    return
  fi
  if command -v wslpath >/dev/null 2>&1; then
    wslpath -w "${shell_path}"
    return
  fi
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "${shell_path}"
    return
  fi
  if [[ "${shell_path}" =~ ^/mnt/([A-Za-z])/(.*)$ ]]; then
    local drive="${BASH_REMATCH[1]^^}"
    local rest="${BASH_REMATCH[2]//\//\\}"
    echo "${drive}:\\${rest}"
    return
  fi
  if [[ "${shell_path}" =~ ^/([A-Za-z])/(.*)$ ]]; then
    local drive="${BASH_REMATCH[1]^^}"
    local rest="${BASH_REMATCH[2]//\//\\}"
    echo "${drive}:\\${rest}"
    return
  fi
  echo "${shell_path}"
}

ANDROID_WINDOWS_WORKDIR_DEFAULT='C:\dev\foliole-android-preview'
ANDROID_WINDOWS_WORKDIR="${ANDROID_WINDOWS_WORKDIR:-${ANDROID_WINDOWS_WORKDIR_DEFAULT}}"
ANDROID_WINDOWS_MIRROR_DIR="$(android_windows_path_to_shell_path "${ANDROID_WINDOWS_MIRROR_DIR:-${ANDROID_WINDOWS_WORKDIR}}")"
