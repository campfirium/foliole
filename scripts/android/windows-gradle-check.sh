#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/android-windows-workdir.sh"
WINDOWS_SCRIPT_PATH="${WINDOWS_SCRIPT_PATH:-${SCRIPT_DIR}/windows-gradle-check.ps1}"
WINDOWS_SYNC_SCRIPT="${WINDOWS_SYNC_SCRIPT:-${SCRIPT_DIR}/../windows/windows-sync.sh}"
ANDROID_SKIP_WINDOWS_SYNC="${ANDROID_SKIP_WINDOWS_SYNC:-}"
FOLIOLE_ANDROID_ALLOW_DATA_DESTRUCTIVE_TEST="${FOLIOLE_ANDROID_ALLOW_DATA_DESTRUCTIVE_TEST:-}"
TASK_NAME="${1:-}"
shift || true
GRADLE_ARGUMENTS=()

if [[ -z "${TASK_NAME}" ]]; then
  cat <<'EOF'
Usage: bash scripts/android/windows-gradle-check.sh <gradle-task> [gradle-arg...]

Run an Android Gradle verification task in the dedicated Android preview workspace.
Examples:
  bash scripts/android/windows-gradle-check.sh lint
  bash scripts/android/windows-gradle-check.sh testDebugUnitTest
  bash scripts/android/windows-gradle-check.sh connectedDebugAndroidTest --class FolioleCompanionSyncPackContractApplyTest
  bash scripts/android/windows-gradle-check.sh connectedDebugAndroidTest --package com.foliole.android

Device instrumentation tests can delete the active app database. To run
connectedDebugAndroidTest, set FOLIOLE_ANDROID_ALLOW_DATA_DESTRUCTIVE_TEST=1
after backing up or switching to a disposable emulator.
EOF
  exit 1
fi

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --class)
      if [[ -z "${2:-}" ]]; then
        echo "[android-gradle-check] --class requires a test class name." >&2
        exit 1
      fi
      TEST_CLASS="$2"
      if [[ "${TEST_CLASS}" != *.* ]]; then
        TEST_CLASS="com.foliole.android.${TEST_CLASS}"
      fi
      GRADLE_ARGUMENTS+=("-Pandroid.testInstrumentationRunnerArguments.class=${TEST_CLASS}")
      shift 2
      ;;
    --package)
      if [[ -z "${2:-}" ]]; then
        echo "[android-gradle-check] --package requires a Java package name." >&2
        exit 1
      fi
      GRADLE_ARGUMENTS+=("-Pandroid.testInstrumentationRunnerArguments.package=$2")
      shift 2
      ;;
    *)
      GRADLE_ARGUMENTS+=("$1")
      shift
      ;;
  esac
done

if [[ "${TASK_NAME}" == "connectedDebugAndroidTest" && "${FOLIOLE_ANDROID_ALLOW_DATA_DESTRUCTIVE_TEST}" != "1" ]]; then
  cat >&2 <<'EOF'
[android-gradle-check] refused: connectedDebugAndroidTest can delete the active Android app database.
[android-gradle-check] use android:preview for user-data-preserving preview validation.
[android-gradle-check] to run destructive device tests, set FOLIOLE_ANDROID_ALLOW_DATA_DESTRUCTIVE_TEST=1 after backing up or using a disposable emulator.
EOF
  exit 2
fi

if [[ -z "${ANDROID_SKIP_WINDOWS_SYNC}" ]]; then
  mkdir -p "${ANDROID_WINDOWS_MIRROR_DIR}"
  env WINDOWS_MIRROR_DIR="${ANDROID_WINDOWS_MIRROR_DIR}" bash "${WINDOWS_SYNC_SCRIPT}"
fi

POWERSHELL_ARGS=(
  -NoProfile
  -ExecutionPolicy Bypass
  -File "$(wslpath -w "${WINDOWS_SCRIPT_PATH}")"
  -WindowsWorkDir "${ANDROID_WINDOWS_WORKDIR}"
  -TaskName "${TASK_NAME}"
)
if [[ "${#GRADLE_ARGUMENTS[@]}" -gt 0 ]]; then
  POWERSHELL_ARGS+=(-GradleArguments "${GRADLE_ARGUMENTS[@]}")
fi

powershell.exe "${POWERSHELL_ARGS[@]}"
