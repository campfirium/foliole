import { useSyncExternalStore } from 'react';

export type CompanionReadingMode = 'continuous' | 'paged';
const STORAGE_KEY = 'foliole-companion-reading-mode';
const listeners = new Set<() => void>();

export function loadCompanionReadingMode(): CompanionReadingMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'paged' ? 'paged' : 'continuous';
  } catch {
    return 'continuous';
  }
}

export function saveCompanionReadingMode(mode: CompanionReadingMode): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
    listeners.forEach(listener => listener());
    return true;
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function useCompanionReadingMode() {
  return useSyncExternalStore(subscribe, loadCompanionReadingMode);
}
