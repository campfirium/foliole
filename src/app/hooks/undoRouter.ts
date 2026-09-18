import { useEffect, useSyncExternalStore } from 'react';

import {
  getUndoRouterContentDocumentId,
  getUndoRouterOwner,
  setUndoRouterTarget,
  subscribeUndoRouter
} from '../../store/workspaceUndoRouter';

export {
  getUndoRouterContentContext,
  getUndoRouterContentDocumentId,
  getUndoRouterOwner,
  registerUndoRouterContentContext,
  setUndoRouterOwner,
  setUndoRouterTarget,
  type UndoRouterOwner
} from '../../store/workspaceUndoRouter';

export function resolveUndoRouterOwner(target: EventTarget | null) {
  if (!(target instanceof Element) || target.closest('[role="dialog"]')) return null;
  const surface = target.closest<HTMLElement>('[data-undo-history-owner]');
  const value = surface?.dataset.undoHistoryOwner;
  return value === 'content' || value === 'workspace' ? value : null;
}

export function useUndoRouterOwner() {
  return useSyncExternalStore(subscribeUndoRouter, getUndoRouterOwner, getUndoRouterOwner);
}

export function useUndoRouterContentDocumentId() {
  return useSyncExternalStore(subscribeUndoRouter, getUndoRouterContentDocumentId, getUndoRouterContentDocumentId);
}

export function useUndoRouterSurfaceTracking() {
  useEffect(() => {
    const handleSurfaceEvent = (event: Event) => {
      const nextOwner = resolveUndoRouterOwner(event.target);
      if (!nextOwner) return;
      const target = event.target instanceof Element ? event.target : null;
      const documentId = target?.closest<HTMLElement>('[data-undo-history-document-id]')
        ?.dataset.undoHistoryDocumentId ?? null;
      setUndoRouterTarget(nextOwner, nextOwner === 'content' ? documentId : null);
    };
    document.addEventListener('focusin', handleSurfaceEvent, true);
    document.addEventListener('pointerdown', handleSurfaceEvent, true);
    return () => {
      document.removeEventListener('focusin', handleSurfaceEvent, true);
      document.removeEventListener('pointerdown', handleSurfaceEvent, true);
    };
  }, []);
}
