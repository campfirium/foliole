import { invoke } from '@tauri-apps/api/core';

interface TauriBridgeWindow extends Window {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
}

interface BootPayload {
  [key: string]: unknown;
}

declare global {
  interface Window {
    __FOLIOLE_APP_READY_REPORTED__?: boolean;
  }
}

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined' || !isTauriRuntime()) {
    return null;
  }
  return invoke as TauriInvoke;
}

type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function isTauriRuntime() {
  const tauriWindow = window as TauriBridgeWindow;
  return Boolean(tauriWindow.__TAURI__ || tauriWindow.__TAURI_INTERNALS__);
}

export function reportNativeBootStage(stage: string, payload?: BootPayload) {
  const invoke = getInvoke();
  if (!invoke) {
    return;
  }
  void invoke('boot_report', { stage, payload }).catch((error) => {
    console.error('[startup] boot_report failed', { stage, error });
  });
}

export function reportNativeAppReady(payload?: BootPayload) {
  if (window.__FOLIOLE_APP_READY_REPORTED__) {
    return;
  }
  window.__FOLIOLE_APP_READY_REPORTED__ = true;
  reportNativeBootStage('app_ready', payload);
}
