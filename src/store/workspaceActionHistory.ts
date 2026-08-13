import type { WorkspaceState } from './workspaceStore';
import { applyWorkspaceStructureHistory } from './workspaceStructureHistoryApply';
import type {
  WorkspaceStructureHistoryEntry,
  WorkspaceStructurePendingCreate
} from './workspaceStructureHistoryTypes';

const ACTION_HISTORY_LIMIT = 50;

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;
type WorkspaceGet = () => WorkspaceState;

export type WorkspaceActionHistoryEntry = WorkspaceStructureHistoryEntry;

export interface WorkspaceActionHistoryState {
  applying?: { entryId: string; mode: 'redo' | 'undo' } | null;
  pendingCreate?: WorkspaceStructurePendingCreate | null;
  redoStack: WorkspaceActionHistoryEntry[];
  undoStack: WorkspaceActionHistoryEntry[];
}

export function createEmptyWorkspaceActionHistory(): WorkspaceActionHistoryState {
  return { applying: null, pendingCreate: null, redoStack: [], undoStack: [] };
}

function trimHistoryStack(stack: WorkspaceActionHistoryEntry[]) {
  return stack.slice(Math.max(0, stack.length - ACTION_HISTORY_LIMIT));
}

export function pushWorkspaceUndoEntry(
  history: WorkspaceActionHistoryState,
  entry: WorkspaceActionHistoryEntry
): WorkspaceActionHistoryState {
  return {
    ...history,
    redoStack: [],
    undoStack: trimHistoryStack([...history.undoStack, entry])
  };
}

export function beginWorkspaceStructureCreate(
  history: WorkspaceActionHistoryState,
  entry: WorkspaceStructurePendingCreate['entry']
): WorkspaceActionHistoryState {
  return { ...history, pendingCreate: { entry, undoRequested: false } };
}

export function failWorkspaceStructureCreate(
  history: WorkspaceActionHistoryState,
  entryId: string
): WorkspaceActionHistoryState {
  return history.pendingCreate?.entry.id === entryId ? { ...history, pendingCreate: null } : history;
}

export function settleWorkspaceStructureCreate(
  history: WorkspaceActionHistoryState,
  entryId: string
) {
  const pending = history.pendingCreate;
  if (!pending || pending.entry.id !== entryId) return { history, undoRequested: false };
  return {
    history: pushWorkspaceUndoEntry({ ...history, pendingCreate: null }, pending.entry),
    undoRequested: pending.undoRequested
  };
}

function getTopEntry(history: WorkspaceActionHistoryState, mode: 'redo' | 'undo') {
  const stack = mode === 'undo' ? history.undoStack : history.redoStack;
  return stack[stack.length - 1] ?? null;
}

function moveHistoryCursor(
  history: WorkspaceActionHistoryState,
  entry: WorkspaceActionHistoryEntry,
  mode: 'redo' | 'undo'
): WorkspaceActionHistoryState {
  if (mode === 'undo') {
    return {
      ...history,
      applying: null,
      redoStack: trimHistoryStack([...history.redoStack, entry]),
      undoStack: history.undoStack.slice(0, -1)
    };
  }
  return {
    ...history,
    applying: null,
    redoStack: history.redoStack.slice(0, -1),
    undoStack: trimHistoryStack([...history.undoStack, entry])
  };
}

function requestPendingCreateUndo(set: WorkspaceSet, expectedEntryId?: string) {
  let requested = false;
  set((state) => {
    const pending = state.appActionHistory.pendingCreate;
    if (!pending || (expectedEntryId && pending.entry.id !== expectedEntryId)) return state;
    requested = true;
    return {
      appActionHistory: {
        ...state.appActionHistory,
        pendingCreate: { ...pending, undoRequested: true }
      }
    };
  });
  return requested;
}

function createApplyWorkspaceHistoryAction(set: WorkspaceSet, get: WorkspaceGet, mode: 'redo' | 'undo') {
  return (expectedEntryId?: string) => {
    const snapshot = get();
    if (snapshot.appActionHistory.applying) return false;
    if (mode === 'undo' && snapshot.appActionHistory.pendingCreate) {
      return requestPendingCreateUndo(set, expectedEntryId);
    }
    const entry = getTopEntry(snapshot.appActionHistory, mode);
    if (!entry || (expectedEntryId && entry.id !== expectedEntryId)) return false;
    set((state) => ({
      appActionHistory: { ...state.appActionHistory, applying: { entryId: entry.id, mode } }
    }));
    void applyWorkspaceStructureHistory({ entry, get, mode }).then((patch) => {
      set((state) => {
        const applying = state.appActionHistory.applying;
        const top = getTopEntry(state.appActionHistory, mode);
        if (applying?.entryId !== entry.id || applying.mode !== mode || top?.id !== entry.id) return state;
        return {
          ...(patch ?? {}),
          appActionHistory: patch
            ? moveHistoryCursor(state.appActionHistory, entry, mode)
            : { ...state.appActionHistory, applying: null }
        };
      });
    });
    return true;
  };
}

export function getWorkspaceUndoTitle(history: WorkspaceActionHistoryState) {
  const entry = history.pendingCreate?.entry ?? history.undoStack[history.undoStack.length - 1] ?? null;
  return entry ? `Undo ${entry.title}` : 'Undo';
}

export function getWorkspaceRedoTitle(history: WorkspaceActionHistoryState) {
  const entry = history.redoStack[history.redoStack.length - 1] ?? null;
  return entry ? `Redo ${entry.title}` : 'Redo';
}

export function createWorkspaceActionHistoryActions(set: WorkspaceSet, get: WorkspaceGet) {
  return {
    redoWorkspaceAction: createApplyWorkspaceHistoryAction(set, get, 'redo'),
    undoWorkspaceAction: createApplyWorkspaceHistoryAction(set, get, 'undo')
  };
}
