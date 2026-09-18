import { ChangeSet } from '@codemirror/state';

import {
  createEmptyEditorOperationHistory,
  type EditorOperationHistoryEntry,
  type EditorOperationHistorySession,
  type EditorOperationHistoryState,
  type EditorTextEditOperationEntry
} from './editorOperationHistory';

const PERSISTED_HISTORY_VERSION = 1;

type PersistedTextEntry = Omit<EditorTextEditOperationEntry, 'forwardChanges' | 'inverseChanges'> & {
  forwardChanges: ReturnType<ChangeSet['toJSON']>;
  inverseChanges: ReturnType<ChangeSet['toJSON']>;
};
type PersistedEntry = Exclude<EditorOperationHistoryEntry, { type: 'text.edit' }> | PersistedTextEntry;

function persistEntry(entry: EditorOperationHistoryEntry): PersistedEntry | null {
  if (entry.type !== 'text.edit') {
    return entry.canonical === 'confirmed' && !entry.applyingMode ? entry : null;
  }
  return {
    ...entry,
    forwardChanges: entry.forwardChanges.toJSON(),
    inverseChanges: entry.inverseChanges.toJSON()
  };
}

function persistStack(stack: EditorOperationHistoryEntry[]) {
  return stack.map(persistEntry).filter((entry): entry is PersistedEntry => entry !== null);
}

export function serializeEditorOperationHistory(history: EditorOperationHistoryState) {
  const sessionsByNodeId = Object.fromEntries(Object.entries(history.sessionsByNodeId).map(([nodeId, session]) => [
    nodeId,
    session ? {
      redoStack: persistStack(session.redoStack),
      undoStack: persistStack(session.undoStack)
    } : undefined
  ]));
  return JSON.stringify({
    history: { ...history, sessionsByNodeId },
    version: PERSISTED_HISTORY_VERSION
  });
}

function reviveEntry(value: PersistedEntry): EditorOperationHistoryEntry {
  if (value.type !== 'text.edit') return value;
  return {
    ...value,
    forwardChanges: ChangeSet.fromJSON(value.forwardChanges),
    inverseChanges: ChangeSet.fromJSON(value.inverseChanges)
  };
}

function reviveSession(value: unknown): EditorOperationHistorySession | null {
  if (!value || typeof value !== 'object') return null;
  const session = value as { redoStack?: unknown; undoStack?: unknown };
  if (!Array.isArray(session.redoStack) || !Array.isArray(session.undoStack)) return null;
  return {
    redoStack: (session.redoStack as PersistedEntry[]).map(reviveEntry),
    undoStack: (session.undoStack as PersistedEntry[]).map(reviveEntry)
  };
}

export function deserializeEditorOperationHistory(payload: string): EditorOperationHistoryState {
  try {
    const parsed = JSON.parse(payload) as {
      history?: Partial<EditorOperationHistoryState>;
      version?: number;
    };
    if (parsed.version !== PERSISTED_HISTORY_VERSION || !parsed.history?.sessionsByNodeId) {
      return createEmptyEditorOperationHistory();
    }
    const sessionsByNodeId = Object.fromEntries(Object.entries(parsed.history.sessionsByNodeId)
      .map(([nodeId, session]) => [nodeId, reviveSession(session)] as const)
      .filter((entry): entry is readonly [string, EditorOperationHistorySession] => entry[1] !== null));
    return {
      invalidations: Array.isArray(parsed.history.invalidations) ? parsed.history.invalidations : [],
      recentNodeIds: Array.isArray(parsed.history.recentNodeIds)
        ? parsed.history.recentNodeIds.filter((id): id is string => typeof id === 'string')
        : [],
      sessionsByNodeId
    };
  } catch {
    return createEmptyEditorOperationHistory();
  }
}
