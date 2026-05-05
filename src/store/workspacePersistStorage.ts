import type { StateStorage } from 'zustand/middleware';

import { getRuntimeInvoke } from '../shared/platform/bridge';

function getLocalFallbackStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage;
}

export const workspacePersistStorage: StateStorage = {
  async getItem(name) {
    const runtimeInvoke = getRuntimeInvoke();
    if (runtimeInvoke) {
      try {
        const result = await runtimeInvoke('load_workspace_state', { storageKey: name });
        if (typeof result === 'string') {
          return result;
        }
        const fallbackPayload = getLocalFallbackStorage()?.getItem(name) ?? null;
        if (fallbackPayload) {
          try {
            await runtimeInvoke('save_workspace_state', { storageKey: name, payload: fallbackPayload });
          } catch {
            // Keep local fallback payload even when migration write fails.
          }
        }
        return fallbackPayload;
      } catch {
        // Fall back to browser storage when native storage command is unavailable.
      }
    }
    return getLocalFallbackStorage()?.getItem(name) ?? null;
  },
  async setItem(name, value) {
    const runtimeInvoke = getRuntimeInvoke();
    if (runtimeInvoke) {
      try {
        await runtimeInvoke('save_workspace_state', { storageKey: name, payload: value });
        return;
      } catch {
        // Fall back to browser storage when native storage command is unavailable.
      }
    }
    getLocalFallbackStorage()?.setItem(name, value);
  },
  async removeItem(name) {
    const runtimeInvoke = getRuntimeInvoke();
    if (runtimeInvoke) {
      try {
        await runtimeInvoke('clear_workspace_state', { storageKey: name });
        return;
      } catch {
        // Fall back to browser storage when native storage command is unavailable.
      }
    }
    getLocalFallbackStorage()?.removeItem(name);
  }
};
