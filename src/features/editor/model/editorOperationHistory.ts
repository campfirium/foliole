import type { EditorState } from '@codemirror/state';

import type { Translate } from '../../../shared/localization/LocalizationProvider';

import { isolateDocumentTextHistory, prepareNativeEditorTextEntry, retainNativeTextEntries, retainNativeTextStates, replaceNativeTextState } from './editorNativeOperationHistory';
import type {
  EditorAnnotationOperationEntry,
  EditorOperationHistoryEntry,
  EditorOperationHistoryInvalidation,
  EditorOperationHistorySession,
  EditorOperationHistoryState,
  EditorOperationHistoryInput
} from './editorOperationHistoryTypes';
import { isolateNativeTextHistory, runNativeTextHistory } from './nativeTextHistory';

export type * from './editorOperationHistoryTypes';

const DEFAULT_OPERATION_LIMIT = 500;
const DEFAULT_SESSION_LIMIT = 12;
const INVALIDATION_LIMIT = 20;

export function createEmptyEditorOperationHistory(): EditorOperationHistoryState {
  return { invalidations: [], nativeTextStates: {}, recentNodeIds: [], sessionsByNodeId: {} };
}

export function getEditorOperationSession(
  history: EditorOperationHistoryState,
  nodeId: string | null | undefined
): EditorOperationHistorySession {
  return (nodeId ? history.sessionsByNodeId[nodeId] : undefined) ?? { redoStack: [], undoStack: [] };
}

export function getEditorOperationTopEntry(
  history: EditorOperationHistoryState,
  nodeId: string | null | undefined,
  mode: 'redo' | 'undo'
) {
  const session = getEditorOperationSession(history, nodeId);
  const stack = mode === 'undo' ? session.undoStack : session.redoStack;
  const entry = stack.at(-1);
  if (!entry) return null;
  const nativeState = entry.type === 'text.edit' ? history.nativeTextStates[entry.nativeTargetKey] : undefined;
  return nativeState ? { ...entry, nativeState } : entry;
}

function touchSession(history: EditorOperationHistoryState, nodeId: string, session: EditorOperationHistorySession) {
  const recentNodeIds = [nodeId, ...history.recentNodeIds.filter((id) => id !== nodeId)].slice(0, DEFAULT_SESSION_LIMIT);
  const keepNodeIds = new Set(recentNodeIds);
  const next = {
    ...history,
    recentNodeIds,
    sessionsByNodeId: Object.fromEntries([
      ...Object.entries(history.sessionsByNodeId).filter(([id]) => keepNodeIds.has(id)),
      [nodeId, session]
    ])
  };
  return { ...next, nativeTextStates: retainNativeTextStates(next) };
}

function trim(stack: EditorOperationHistoryEntry[], limit = DEFAULT_OPERATION_LIMIT) {
  return stack.slice(Math.max(0, stack.length - limit));
}

export function pushEditorOperationEntry(
  history: EditorOperationHistoryState,
  input: EditorOperationHistoryInput,
  limit = DEFAULT_OPERATION_LIMIT
): EditorOperationHistoryState {
  const session = getEditorOperationSession(history, input.nodeId);
  if (input.type !== 'text.input') {
    return touchSession({ ...history, nativeTextStates: isolateDocumentTextHistory(history, input.nodeId) },
      input.nodeId, { ...session, externalTextBoundary: {}, textBoundary: {}, redoStack: [], undoStack: trim([...session.undoStack, input], limit) });
  }
  const { continuous, entry, groups, key, state } = prepareNativeEditorTextEntry(history, input);
  const undoStack = continuous ? session.undoStack : retainNativeTextEntries(session.undoStack, key, groups.undo);
  const previous = undoStack.at(-1);
  const merged = previous?.type === 'text.edit' && previous.nativeTargetKey === key && previous.nativeGroup === entry.nativeGroup;
  const nextEntry = merged && previous.target && entry.target
    ? { ...entry, target: { ...entry.target, beforeVersionId: previous.target.beforeVersionId } } : entry;
  return touchSession({ ...history, nativeTextStates: replaceNativeTextState(history, key, state) }, input.nodeId, {
    ...session, ...(!input.nativeState ? { externalTextBoundary: {} } : {}), ...(groups.applicationBoundary ? { textBoundary: groups.applicationBoundary } : {}),
    redoStack: [], undoStack: trim([...undoStack.slice(0, merged ? -1 : undoStack.length), nextEntry], limit)
  });
}

export function replaceEditorOperationEntry(
  history: EditorOperationHistoryState,
  nodeId: string,
  mode: 'redo' | 'undo',
  entry: EditorOperationHistoryEntry
) {
  const session = getEditorOperationSession(history, nodeId);
  const stack = mode === 'undo' ? session.undoStack : session.redoStack;
  if (stack.at(-1)?.type !== entry.type) return history;
  const nextStack = [...stack.slice(0, -1), entry];
  return touchSession(history, nodeId, mode === 'undo'
    ? { ...session, undoStack: nextStack }
    : { ...session, redoStack: nextStack });
}

export function replaceEditorOperationEntryWhere(
  history: EditorOperationHistoryState,
  nodeId: string,
  mode: 'redo' | 'undo',
  predicate: (entry: EditorOperationHistoryEntry) => boolean,
  replacement: (entry: EditorOperationHistoryEntry) => EditorOperationHistoryEntry
) {
  const session = getEditorOperationSession(history, nodeId);
  const stack = mode === 'undo' ? session.undoStack : session.redoStack;
  let targetIndex = -1;
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (predicate(stack[index]!)) {
      targetIndex = index;
      break;
    }
  }
  if (targetIndex < 0) return history;
  const nextStack = stack.map((entry, index) => index === targetIndex ? replacement(entry) : entry);
  return touchSession(history, nodeId, mode === 'undo'
    ? { ...session, undoStack: nextStack }
    : { ...session, redoStack: nextStack });
}

export function removeEditorOperationEntryFromStack(
  history: EditorOperationHistoryState,
  nodeId: string,
  mode: 'redo' | 'undo',
  predicate: (entry: EditorOperationHistoryEntry) => boolean
) {
  const session = getEditorOperationSession(history, nodeId);
  return touchSession(history, nodeId, mode === 'undo'
    ? { ...session, undoStack: session.undoStack.filter((entry) => !predicate(entry)) }
    : { ...session, redoStack: session.redoStack.filter((entry) => !predicate(entry)) });
}

export function moveEditorOperationEntry(
  history: EditorOperationHistoryState,
  nodeId: string,
  mode: 'redo' | 'undo',
  nativeState?: EditorState
) {
  const session = getEditorOperationSession(history, nodeId);
  const source = mode === 'undo' ? session.undoStack : session.redoStack;
  const entry = source.at(-1);
  if (!entry) return history;
  if (entry.type === 'text.edit') {
    const current = history.nativeTextStates[entry.nativeTargetKey];
    const nextState = nativeState ?? (current && runNativeTextHistory(current, mode, entry.nativeGroup)?.state);
    if (!nextState) return history;
    history = { ...history, nativeTextStates: replaceNativeTextState(history, entry.nativeTargetKey, isolateNativeTextHistory(nextState)) };
  }
  if (entry.type !== 'text.edit') {
    history = { ...history, nativeTextStates: isolateDocumentTextHistory(history, nodeId) };
  }
  const boundary = { externalTextBoundary: {}, textBoundary: {} };
  const next = mode === 'undo'
    ? { ...session, ...boundary, redoStack: trim([...session.redoStack, entry]), undoStack: source.slice(0, -1) }
    : { ...session, ...boundary, redoStack: source.slice(0, -1), undoStack: trim([...session.undoStack, entry]) };
  return touchSession(history, nodeId, next);
}

export function removeEditorOperationEntry(
  history: EditorOperationHistoryState,
  nodeId: string,
  predicate: (entry: EditorOperationHistoryEntry) => boolean
) {
  const session = getEditorOperationSession(history, nodeId);
  return touchSession(history, nodeId, {
    redoStack: session.redoStack.filter((entry) => !predicate(entry)),
    undoStack: session.undoStack.filter((entry) => !predicate(entry))
  });
}

export function invalidateEditorOperationSession(
  history: EditorOperationHistoryState,
  invalidation: EditorOperationHistoryInvalidation
) {
  const sessionsByNodeId = { ...history.sessionsByNodeId };
  delete sessionsByNodeId[invalidation.nodeId];
  const next = {
    ...history,
    invalidations: [...history.invalidations, invalidation].slice(-INVALIDATION_LIMIT),
    recentNodeIds: history.recentNodeIds.filter((id) => id !== invalidation.nodeId),
    sessionsByNodeId
  };
  return { ...next, nativeTextStates: retainNativeTextStates(next) };
}

export function isPendingEditorAnnotationEntry(
  entry: EditorOperationHistoryEntry | null | undefined
): entry is EditorAnnotationOperationEntry {
  return Boolean(entry && entry.type !== 'text.edit' && (entry.canonical === 'pending' || entry.applyingMode));
}

function getTitle(entry: EditorOperationHistoryEntry, t: Translate) {
  if (entry.type === 'text.edit') return t('desktop.command.editorOperation.editText');
  if (entry.type === 'annotation.create') return t('desktop.command.editorOperation.createAnnotation');
  return t('desktop.command.editorOperation.deleteAnnotation');
}

export function getEditorOperationUndoTitle(history: EditorOperationHistoryState, nodeId: string | null, t: Translate) {
  const entry = getEditorOperationTopEntry(history, nodeId, 'undo');
  return entry ? t('desktop.command.undoOperation', { operation: getTitle(entry, t) }) : t('desktop.command.undo');
}

export function getEditorOperationRedoTitle(history: EditorOperationHistoryState, nodeId: string | null, t: Translate) {
  const entry = getEditorOperationTopEntry(history, nodeId, 'redo');
  return entry ? t('desktop.command.redoOperation', { operation: getTitle(entry, t) }) : t('desktop.command.redo');
}
