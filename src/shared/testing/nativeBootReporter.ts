import { getRuntimeInvoke } from '../platform/bridge';

interface BootPayload {
  [key: string]: unknown;
}

declare global {
  interface Window {
    __FOLIOLE_APP_READY_REPORTED__?: boolean;
  }
}

export function reportNativeBootStage(stage: string, payload?: BootPayload) {
  const invoke = getRuntimeInvoke();
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
