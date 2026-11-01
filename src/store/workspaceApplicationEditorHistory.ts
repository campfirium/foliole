import { editorTextTargetKey } from '../features/editor/model/editorNativeOperationHistory';
import type { EditorOperationHistoryEntry, EditorOperationHistoryInput, EditorOperationHistoryState } from '../features/editor/model/editorOperationHistoryTypes';
import { isolateNativeTextHistory } from '../features/editor/model/nativeTextHistory';

import { admitApplicationOperation, applyApplicationTextReplay, removeApplicationOperation, updateApplicationOperation,
  type ApplicationHistory, type ApplicationOperation } from './workspaceApplicationHistory';

export function projectApplicationEditorHistory(history: EditorOperationHistoryState, application: ApplicationHistory): EditorOperationHistoryState {
  const sessionsByNodeId: EditorOperationHistoryState['sessionsByNodeId'] = {};
  const keys = new Set<string>();
  for (const direction of ['undo', 'redo'] as const) for (const operation of application[direction]) {
    if (operation.domain !== 'editor') continue;
    const entry = operation.entry;
    const session = sessionsByNodeId[entry.nodeId] ??= { undoStack: [], redoStack: [] };
    session[direction === 'undo' ? 'undoStack' : 'redoStack'].push(entry);
    if (entry.type === 'text.edit') keys.add(entry.nativeTargetKey);
  }
  const top = application.undo.at(-1);
  for (const session of Object.values(sessionsByNodeId)) if (session) session.textBoundary = top ?? application;
  return { ...history, application, sessionsByNodeId, recentNodeIds: Object.keys(sessionsByNodeId),
    nativeTextStates: Object.fromEntries(Object.entries(history.nativeTextStates).filter(([key]) => keys.has(key))) };
}

export function prepareApplicationEditorInput(history: EditorOperationHistoryState, input: EditorOperationHistoryInput) {
  const top = history.application?.undo.at(-1);
  const key = input.type === 'text.input' ? editorTextTargetKey(input.nodeId, input.target) : null;
  const continuous = top?.domain === 'editor' && top.entry.type === 'text.edit' && top.entry.nativeTargetKey === key;
  return { ...history, application: undefined,
    nativeTextStates: continuous ? history.nativeTextStates : Object.fromEntries(Object.entries(history.nativeTextStates)
      .map(([id, state]) => [id, isolateNativeTextHistory(state)])) };
}

export function publishApplicationEditorInput(history: EditorOperationHistoryState, input: EditorOperationHistoryInput, next: EditorOperationHistoryState) {
  const entry = next.sessionsByNodeId[input.nodeId]?.undoStack.at(-1);
  if (!entry || !history.application) return next;
  const top = history.application.undo.at(-1);
  const sameGroup = top?.domain === 'editor' && top.entry.type === 'text.edit' && entry.type === 'text.edit' &&
    top.entry.nativeTargetKey === entry.nativeTargetKey && top.entry.nativeGroup === entry.nativeGroup;
  const operation: ApplicationOperation = { id: sameGroup ? top.id : crypto.randomUUID(), order: 0,
    ready: entry.type === 'text.edit' || entry.canonical === 'confirmed', domain: 'editor', entry };
  operation.entry = { ...operation.entry, applicationOperationId: operation.id };
  const application = admitApplicationOperation(history.application, operation);
  return projectApplicationEditorHistory({ ...next, nativeTextStates: { ...history.nativeTextStates, ...next.nativeTextStates } }, application);
}

/** Existing document algorithms produce payload changes; only the application owns their position. */
export function publishApplicationEditorMutation(history: EditorOperationHistoryState, next: EditorOperationHistoryState,
  nodeId: string, mode?: 'undo' | 'redo', remove = false) {
  let application = history.application!;
  const before = history.sessionsByNodeId[nodeId];
  const after = next.sessionsByNodeId[nodeId];
  const previous = [...before?.undoStack ?? [], ...before?.redoStack ?? []];
  const updated = [...after?.undoStack ?? [], ...after?.redoStack ?? []];
  const identify = (a: EditorOperationHistoryEntry, b: EditorOperationHistoryEntry) =>
    a.applicationOperationId === b.applicationOperationId;
  for (const operation of [...application.undo, ...application.redo]) {
    if (operation.domain !== 'editor' || operation.entry.nodeId !== nodeId) continue;
    const entry = updated.find(value => identify(value, operation.entry));
    if (entry) application = updateApplicationOperation(application, { ...operation, entry,
      ready: entry.type === 'text.edit' || entry.canonical === 'confirmed' });
    else if (remove && previous.some(value => identify(value, operation.entry))) application = removeApplicationOperation(application, operation.id);
  }
  const request = application.requests[0];
  if (mode && request?.direction === mode && request.stage !== 'reserved') {
    const operation = [...application.undo, ...application.redo].find(value => value.id === request.operationId);
    if (operation?.domain === 'editor' && operation.entry.type === 'text.edit') application = applyApplicationTextReplay(application, request.id, operation);
  }
  return projectApplicationEditorHistory({ ...next, nativeTextStates: { ...history.nativeTextStates, ...next.nativeTextStates } }, application);
}
