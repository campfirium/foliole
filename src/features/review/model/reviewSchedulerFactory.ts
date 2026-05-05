import { createLocalReviewSchedulerAdapter } from './localReviewSchedulerAdapter';
import type { ReviewSchedulerAdapter } from './reviewTypes';
import { createRustReviewSchedulerAdapter } from './rustReviewSchedulerAdapter';

interface TauriCoreBridge {
  invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
}

interface TauriBridgeWindow extends Window {
  __TAURI__?: {
    core?: TauriCoreBridge;
  };
}

function getTauriInvoke() {
  if (typeof window === 'undefined') {
    return null;
  }
  const tauriWindow = window as TauriBridgeWindow;
  return tauriWindow.__TAURI__?.core?.invoke ?? null;
}

export function createReviewSchedulerAdapter(): ReviewSchedulerAdapter {
  const invoke = getTauriInvoke();
  if (invoke) {
    return createRustReviewSchedulerAdapter(invoke);
  }
  return createLocalReviewSchedulerAdapter();
}
