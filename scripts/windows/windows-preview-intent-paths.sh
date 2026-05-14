#!/usr/bin/env bash

resolve_renderer_reload_intent_root() {
  if [ -n "${WINDOWS_RENDERER_RELOAD_INTENT_ROOT}" ]; then
    printf '%s' "${WINDOWS_RENDERER_RELOAD_INTENT_ROOT}"
    return 0
  fi
  if [ -n "${WINDOWS_RESTART_INTENT_ROOT}" ]; then
    printf '%s' "${WINDOWS_RESTART_INTENT_ROOT}"
    return 0
  fi
  if command -v wslpath >/dev/null 2>&1; then
    wslpath -u "${WINDOWS_WORKDIR}"
    return 0
  fi
  printf '%s' "${REPO_ROOT}"
}

resolve_renderer_reload_delivery_path() {
  printf '%s/%s' "$(resolve_renderer_reload_intent_root)" "${DEV_RENDERER_RELOAD_DELIVERY_FILE}"
}

resolve_renderer_reload_intent_path() {
  printf '%s/%s' "$(resolve_renderer_reload_intent_root)" ".windows-dev-renderer-reload-intent.json"
}

resolve_restart_intent_root() {
  if [ -n "${WINDOWS_RESTART_INTENT_ROOT}" ]; then
    printf '%s' "${WINDOWS_RESTART_INTENT_ROOT}"
    return 0
  fi
  if command -v wslpath >/dev/null 2>&1; then
    wslpath -u "${WINDOWS_WORKDIR}"
    return 0
  fi
  printf '%s' "${REPO_ROOT}"
}

resolve_restart_delivery_path() {
  printf '%s/%s' "$(resolve_restart_intent_root)" "${DEV_RESTART_DELIVERY_FILE}"
}

resolve_boot_ready_path() {
  printf '%s/%s' "$(resolve_restart_intent_root)" "${BOOT_READY_FILE}"
}

resolve_bridge_ready_path() {
  printf '%s/%s' "$(resolve_restart_intent_root)" "${BRIDGE_READY_FILE}"
}

cancel_pending_renderer_reload_intent() {
  local intent_path=""
  intent_path="$(resolve_renderer_reload_intent_path)"
  if [ -f "${intent_path}" ]; then
    rm -f "${intent_path}"
    echo "[windows-preview] canceled pending renderer reload intent path=${intent_path}"
  fi
}
