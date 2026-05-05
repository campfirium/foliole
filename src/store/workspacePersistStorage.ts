import type { StateStorage } from 'zustand/middleware';

function getLocalFallbackStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage;
}

export const workspacePersistStorage: StateStorage = {
  getItem(name) {
    return getLocalFallbackStorage()?.getItem(name) ?? null;
  },
  setItem(name, value) {
    getLocalFallbackStorage()?.setItem(name, value);
  },
  removeItem(name) {
    getLocalFallbackStorage()?.removeItem(name);
  }
};
