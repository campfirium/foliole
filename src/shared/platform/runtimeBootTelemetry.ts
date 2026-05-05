import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';

interface BootPayload {
  [key: string]: unknown;
}

declare global {
  interface Window {
    __FOLIOLE_APP_READY_REPORTED__?: boolean;
    __FOLIOLE_BRIDGE_READY_REPORTED__?: boolean;
  }
}

export function reportRuntimeBootStage(stage: string, payload?: BootPayload) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke(NATIVE_COMMANDS.bootReport, { stage, payload }).catch((error) => {
    console.error('[startup] boot_report failed', { stage, error });
  });
}

export function reportRuntimeAppReady(payload?: BootPayload) {
  if (typeof window === 'undefined' || window.__FOLIOLE_APP_READY_REPORTED__) {
    return;
  }
  window.__FOLIOLE_APP_READY_REPORTED__ = true;
  reportRuntimeBootStage('app_ready', payload);
}

export function reportRuntimeBridgeReady(payload?: BootPayload) {
  if (typeof window === 'undefined' || window.__FOLIOLE_BRIDGE_READY_REPORTED__) {
    return;
  }
  if (!getRuntimeInvoke()) {
    return;
  }
  window.__FOLIOLE_BRIDGE_READY_REPORTED__ = true;
  reportRuntimeBootStage('bridge_ready', payload);
}
