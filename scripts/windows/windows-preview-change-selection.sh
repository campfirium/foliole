#!/usr/bin/env bash

has_committed_electron_changes_since() {
  local runtime_head="$1"
  if [ -n "${WINDOWS_PREVIEW_COMMITTED_ELECTRON_CHANGES:-}" ]; then
    [ -n "${WINDOWS_PREVIEW_COMMITTED_ELECTRON_CHANGES}" ]
    return
  fi
  if [ -z "${runtime_head}" ] || [ -z "${CURRENT_HEAD}" ]; then
    return 1
  fi
  if [ "${runtime_head}" = "${CURRENT_HEAD}" ]; then
    return 1
  fi
  if ! git rev-parse --verify "${runtime_head}^{commit}" >/dev/null 2>&1; then
    return 0
  fi
  local committed_files=""
  committed_files="$(git diff --name-only "${runtime_head}..${CURRENT_HEAD}" -- electron/ lib/core/ lib/platform/)"
  if [ -z "${committed_files}" ]; then
    return 1
  fi
  while IFS= read -r file; do
    if is_runtime_file "${file}"; then
      return 0
    fi
  done <<< "${committed_files}"
  return 1
}

is_shell_config_file() {
  local file="$1"
  # Vite-time config captured at electron-dev.mjs boot. A renderer reload or
  # runtime-only Electron restart keeps the same Vite process, so these need a
  # full shell restart to re-run npm run electron:dev from scratch.
  if echo "${file}" | grep -qE '^(tailwind\.config\.(js|cjs|mjs|ts)|postcss\.config\.(js|cjs|mjs|ts)|vite\.config\.(js|cjs|mjs|ts)|vite\.shared\.ts|package\.json|package-lock\.json|scripts/electron-dev\.mjs|scripts/electron-dev-server\.mjs|scripts/windows/electron-dev-native\.mjs)$'; then
    return 0
  fi
  return 1
}

has_matching_file() {
  local changed_files="$1"
  local predicate="$2"
  while IFS= read -r file; do
    if "${predicate}" "${file}"; then
      return 0
    fi
  done <<< "${changed_files}"
  return 1
}

has_committed_shell_config_changes_since() {
  local runtime_head="$1"
  if [ -n "${WINDOWS_PREVIEW_COMMITTED_SHELL_CONFIG_CHANGES:-}" ]; then
    [ -n "${WINDOWS_PREVIEW_COMMITTED_SHELL_CONFIG_CHANGES}" ]
    return
  fi
  if [ -z "${runtime_head}" ] || [ -z "${CURRENT_HEAD}" ]; then
    return 1
  fi
  if [ "${runtime_head}" = "${CURRENT_HEAD}" ]; then
    return 1
  fi
  if ! git rev-parse --verify "${runtime_head}^{commit}" >/dev/null 2>&1; then
    return 0
  fi
  local committed_files=""
  committed_files="$(git diff --name-only "${runtime_head}..${CURRENT_HEAD}")"
  if [ -z "${committed_files}" ]; then
    return 1
  fi
  has_matching_file "${committed_files}" is_shell_config_file
}

is_startup_renderer_file() {
  local file="$1"
  if echo "${file}" | grep -qE '^(src/main\.tsx|src/startupBootstrap\.ts|src/startupViewMode\.ts|src/app/App\.tsx|src/app/components/WorkspaceLayout.*\.tsx|src/app/components/WorkspaceRightSidebar.*\.tsx|src/shared/platform/bridge\.ts|src/shared/platform/runtimeBootTelemetry\.ts)$'; then
    return 0
  fi
  return 1
}

has_committed_startup_renderer_changes_since() {
  local runtime_head="$1"
  if [ -z "${runtime_head}" ] || [ -z "${CURRENT_HEAD}" ]; then
    return 1
  fi
  if [ "${runtime_head}" = "${CURRENT_HEAD}" ]; then
    return 1
  fi
  if ! git rev-parse --verify "${runtime_head}^{commit}" >/dev/null 2>&1; then
    return 0
  fi
  local committed_files=""
  committed_files="$(git diff --name-only "${runtime_head}..${CURRENT_HEAD}")"
  if [ -z "${committed_files}" ]; then
    return 1
  fi
  has_matching_file "${committed_files}" is_startup_renderer_file
}

is_runtime_file() {
  local file="$1"
  # Must be under a runtime directory
  if ! echo "${file}" | grep -qE '^(electron/|lib/core/|lib/platform/)'; then
    return 1
  fi
  # Exclude test files, config files, and non-runtime artifacts
  if echo "${file}" | grep -qE '\.(test|spec)\.(ts|tsx|mjs|js)$'; then
    return 1
  fi
  if echo "${file}" | grep -qE '(tsconfig\.json|\.eslintrc|\.prettierrc)$'; then
    return 1
  fi
  return 0
}

has_runtime_code_changes() {
  has_matching_file "$1" is_runtime_file
}

is_renderer_source_file() {
  local file="$1"
  if ! echo "${file}" | grep -qE '^(src/app/|src/features/|src/shared/|src/store/)'; then
    return 1
  fi
  if echo "${file}" | grep -qE '\.(test|spec)\.(ts|tsx|mjs|js)$'; then
    return 1
  fi
  return 0
}

select_update_action() {
  local changed_files="$1"
  local status_output=""
  local status_exit=0
  local runtime_head=""
  local status_reason=""

  SELECTED_STATUS_DETAIL=""
  SELECTED_RUNTIME_PID=""

  set +e
  status_output="$(run_windows_client_action status)"
  status_exit=$?
  set -e

  if [ "${status_exit}" -eq 0 ] && status_is_running "${status_output}"; then
    SELECTED_STATUS_DETAIL="$(extract_status_detail "${status_output}")"
    SELECTED_RUNTIME_PID="$(extract_runtime_pid "${status_output}")"
    runtime_head="$(extract_runtime_head "${status_output}")"
    if has_matching_file "${changed_files}" is_shell_config_file; then
      SELECTED_ACTION="full-restart"
      SELECTED_REASON="Class D: working tree shell/vite config changes detected"
      return 0
    fi
    if has_committed_shell_config_changes_since "${runtime_head}"; then
      SELECTED_ACTION="full-restart"
      SELECTED_REASON="Class D: runtime behind committed shell/vite config changes"
      return 0
    fi
    if has_matching_file "${changed_files}" is_startup_renderer_file; then
      SELECTED_ACTION="full-restart"
      SELECTED_REASON="Class D: working tree startup renderer changes detected"
      return 0
    fi
    if has_committed_startup_renderer_changes_since "${runtime_head}"; then
      SELECTED_ACTION="full-restart"
      SELECTED_REASON="Class D: runtime behind committed startup renderer changes"
      return 0
    fi
    if has_matching_file "${changed_files}" is_runtime_file; then
      if has_matching_file "${changed_files}" is_renderer_source_file; then
        SELECTED_ACTION="restart-intent"
        SELECTED_REASON="Class B: working tree runtime and renderer changes detected"
        return 0
      fi
      SELECTED_ACTION="restart-intent"
      SELECTED_REASON="Class B: working tree electron changes detected"
      return 0
    fi
    if has_committed_electron_changes_since "${runtime_head}"; then
      if has_matching_file "${changed_files}" is_renderer_source_file; then
        SELECTED_ACTION="restart-intent"
        SELECTED_REASON="Class B: runtime behind committed electron changes with renderer changes"
        return 0
      fi
      SELECTED_ACTION="restart-intent"
      SELECTED_REASON="Class B: runtime behind committed electron changes"
      return 0
    fi
    if has_matching_file "${changed_files}" is_renderer_source_file; then
      SELECTED_ACTION="renderer-reload-intent"
      SELECTED_REASON="Class A: renderer-only sync path"
      return 0
    fi
    SELECTED_ACTION="sync-only"
    SELECTED_REASON="Class A: no runtime changes detected"
    return 0
  fi

  if [ "${status_exit}" -eq 0 ] && status_is_stopped "${status_output}"; then
    SELECTED_STATUS_DETAIL="$(extract_status_detail "${status_output}")"
    status_reason="$(extract_status_reason "${status_output}")"
    SELECTED_ACTION="fallback-start"
    if [ -n "${status_reason}" ]; then
      SELECTED_REASON="Class C: no trusted running client (${status_reason})"
    else
      SELECTED_REASON="Class C: no trusted running client"
    fi
    return 0
  fi

  if [ "${status_exit}" -eq 124 ]; then
    SELECTED_ACTION="status-probe-failed"
    SELECTED_REASON="Class C: status probe timed out"
    return 0
  fi

  SELECTED_ACTION="status-probe-failed"
  SELECTED_REASON="Class C: client status unavailable"
}
