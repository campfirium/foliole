import type { EditorOperationApplyContext } from './workspaceStoreTypes';

export type UndoRouterOwner = 'content' | 'workspace';
export type UndoCommandTarget = { owner: 'workspace' } | { owner: 'content'; documentId: string | null };

export function resolveUndoCommandTarget(
  targetOwner: UndoRouterOwner,
  documentId: string | null | undefined,
  activeNodeId: string | null
): UndoCommandTarget {
  return targetOwner === 'workspace'
    ? { owner: 'workspace' }
    : { owner: 'content', documentId: documentId ?? activeNodeId };
}

let owner: UndoRouterOwner = 'workspace';
let contentDocumentId: string | null = null;
const listeners = new Set<() => void>();
const contentContexts = new Map<string, EditorOperationApplyContext>();

export function subscribeUndoRouter(listener: () => void) {
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
