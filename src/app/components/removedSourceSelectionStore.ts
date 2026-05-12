import { useSyncExternalStore } from 'react';

import type { RuntimeRemovedSourceEntry } from '../../shared/platform/removedSourcesRuntimeRepository';

let selectedRemovedSource: RuntimeRemovedSourceEntry | null = null;
const listeners = new Set<() => void>();

function emitRemovedSourceSelectionChange() {
  listeners.forEach((listener) => listener());
}

export function getSelectedRemovedSource() {
  return selectedRemovedSource;
}

export function setSelectedRemovedSource(entry: RuntimeRemovedSourceEntry | null) {
  selectedRemovedSource = entry;
  emitRemovedSourceSelectionChange();
}

function subscribeRemovedSourceSelection(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSelectedRemovedSource() {
  return useSyncExternalStore(
    subscribeRemovedSourceSelection,
    getSelectedRemovedSource,
    getSelectedRemovedSource
  );
}
