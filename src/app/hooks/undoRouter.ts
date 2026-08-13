import { useEffect, useSyncExternalStore } from 'react';

export type UndoRouterOwner = 'content' | 'workspace';

let owner: UndoRouterOwner = 'workspace';
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUndoRouterOwner() {
  return owner;
}

export function setUndoRouterOwner(nextOwner: UndoRouterOwner) {
  if (owner === nextOwner) return;
  owner = nextOwner;
  listeners.forEach((listener) => listener());
}

export function resolveUndoRouterOwner(target: EventTarget | null) {
  if (!(target instanceof Element) || target.closest('[role="dialog"]')) return null;
  const surface = target.closest<HTMLElement>('[data-undo-history-owner]');
  const value = surface?.dataset.undoHistoryOwner;
  return value === 'content' || value === 'workspace' ? value : null;
}

export function useUndoRouterOwner() {
  return useSyncExternalStore(subscribe, getUndoRouterOwner, getUndoRouterOwner);
}

export function useUndoRouterSurfaceTracking() {
  useEffect(() => {
    const handleSurfaceEvent = (event: Event) => {
      const nextOwner = resolveUndoRouterOwner(event.target);
      if (nextOwner) setUndoRouterOwner(nextOwner);
    };
    document.addEventListener('focusin', handleSurfaceEvent, true);
    document.addEventListener('pointerdown', handleSurfaceEvent, true);
    return () => {
      document.removeEventListener('focusin', handleSurfaceEvent, true);
      document.removeEventListener('pointerdown', handleSurfaceEvent, true);
    };
  }, []);
}
