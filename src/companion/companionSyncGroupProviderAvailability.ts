import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let available = false;

export function publishCompanionSyncGroupProviderAvailability(next: boolean) {
  if (available === next) return;
  available = next;
  listeners.forEach((listener) => listener());
}

export function useCompanionSyncGroupProviderAvailability() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => available,
    () => available
  );
}
