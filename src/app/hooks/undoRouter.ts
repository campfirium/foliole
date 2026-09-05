import { useEffect, useSyncExternalStore } from 'react';

import type { EditorOperationApplyContext } from '../../store/workspaceStoreTypes';

export type UndoRouterOwner = 'content' | 'workspace';

let owner: UndoRouterOwner = 'workspace';
let contentDocumentId: string | null = null;
const listeners = new Set<() => void>();
const contentContexts = new Map<string, EditorOperationApplyContext>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUndoRouterOwner() {
  return owner;
}

export function setUndoRouterOwner(nextOwner: UndoRouterOwner) {
  setUndoRouterTarget(nextOwner, nextOwner === 'content' ? contentDocumentId : null);
}

export function getUndoRouterContentDocumentId() {
  return contentDocumentId;
}

export function setUndoRouterTarget(nextOwner: UndoRouterOwner, nextContentDocumentId: string | null) {
  if (owner === nextOwner && contentDocumentId === nextContentDocumentId) return;
  owner = nextOwner;
  contentDocumentId = nextContentDocumentId;
  listeners.forEach((listener) => listener());
}

export function registerUndoRouterContentContext(documentId: string, context: EditorOperationApplyContext) {
  contentContexts.set(documentId, context);
  return () => {
    if (contentContexts.get(documentId) === context) contentContexts.delete(documentId);
  };
}

export function getUndoRouterContentContext(fallback: EditorOperationApplyContext | undefined) {
  return contentDocumentId ? contentContexts.get(contentDocumentId) : fallback;
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

export function useUndoRouterContentDocumentId() {
  return useSyncExternalStore(subscribe, getUndoRouterContentDocumentId, getUndoRouterContentDocumentId);
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
