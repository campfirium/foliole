import {
  resolveNodeViewStateRestoreTarget,
  type NodeViewStateRestoreTarget,
  type PersistedNodeViewState
} from '../../../../lib/platform/persistedNodeViewState';

export type EditorRestoreTarget = NodeViewStateRestoreTarget;

export type EditorRestoreState =
  | { kind: 'idle' }
  | { kind: 'pending'; target: EditorRestoreTarget }
  | { kind: 'matched'; target: EditorRestoreTarget }
  | { kind: 'applied'; target: EditorRestoreTarget; appliedAt: number }
  | { kind: 'settled'; target: EditorRestoreTarget }
  | { kind: 'invalidated'; target: EditorRestoreTarget; reason: string };

export interface EditorRestoreDocumentState {
  nodeId: string | null;
  valueLength: number;
}

export type EditorRestoreEvent =
  | { type: 'target-changed'; target: EditorRestoreTarget | null }
  | { type: 'document-changed'; document: EditorRestoreDocumentState }
  | { type: 'restore-applied'; appliedAt: number }
  | { type: 'restore-settled' }
  | { type: 'restore-invalidated'; reason: string };

export function resolveEditorRestoreTarget(
  persistedState: PersistedNodeViewState | null | undefined,
  documentState: EditorRestoreDocumentState
): EditorRestoreTarget | null {
  if (!persistedState || persistedState.nodeId !== documentState.nodeId) {
    return null;
  }
  return resolveNodeViewStateRestoreTarget(persistedState);
}

export function reduceEditorRestoreState(
  state: EditorRestoreState,
  event: EditorRestoreEvent
): EditorRestoreState {
  if (event.type === 'target-changed') {
    return event.target ? { kind: 'pending', target: event.target } : { kind: 'idle' };
  }
  if (state.kind === 'idle') {
    return state;
  }
  if (event.type === 'document-changed') {
    return reduceDocumentChanged(state, event.document);
  }
  if (event.type === 'restore-applied') {
    return canApplyRestore(state) ? { kind: 'applied', target: state.target, appliedAt: event.appliedAt } : state;
  }
  if (event.type === 'restore-settled') {
    return state.kind === 'applied' ? { kind: 'settled', target: state.target } : state;
  }
  return { kind: 'invalidated', target: state.target, reason: event.reason };
}

export function isEditorRestoreOriginatedScroll(state: EditorRestoreState) {
  return state.kind === 'matched' || state.kind === 'applied';
}

export function canEditorRestoreTargetMatchDocument(
  target: EditorRestoreTarget,
  documentState: EditorRestoreDocumentState
) {
  return target.nodeId === documentState.nodeId && canMatchDocument(target, documentState);
}

function reduceDocumentChanged(
  state: Exclude<EditorRestoreState, { kind: 'idle' }>,
  documentState: EditorRestoreDocumentState
): EditorRestoreState {
  if (state.target.nodeId !== documentState.nodeId) {
    return { kind: 'invalidated', target: state.target, reason: 'node-changed' };
  }
  if (!canEditorRestoreTargetMatchDocument(state.target, documentState)) {
    return { kind: 'pending', target: state.target };
  }
  if (state.kind === 'applied' || state.kind === 'settled') {
    return state;
  }
  return { kind: 'matched', target: state.target };
}

function canApplyRestore(state: Exclude<EditorRestoreState, { kind: 'idle' }>) {
  return state.kind === 'matched' || state.kind === 'applied';
}

function canMatchDocument(target: EditorRestoreTarget, documentState: EditorRestoreDocumentState) {
  if (documentState.valueLength <= 0 && (target.scrollTop > 0 || hasPositiveSelection(target))) {
    return false;
  }
  if (target.mode === 'scroll-only') {
    return true;
  }
  return Math.max(target.selectionFrom ?? 0, target.selectionTo ?? 0) <= documentState.valueLength;
}

function hasPositiveSelection(target: EditorRestoreTarget) {
  return Math.max(target.selectionFrom ?? 0, target.selectionTo ?? 0) > 0;
}
