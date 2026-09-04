import type { Translate } from '../shared/localization/LocalizationProvider';

import type { WorkspaceActionHistoryEntry } from './workspaceActionHistoryEntry';
import { applyWorkspaceHistoryEntry } from './workspaceHistoryEntryApply';
import type { WorkspaceState } from './workspaceStore';
import type {
  WorkspaceStructurePendingCreate
} from './workspaceStructureHistoryTypes';

const ACTION_HISTORY_LIMIT = 50;

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;
type WorkspaceGet = () => WorkspaceState;

export interface WorkspaceActionHistoryState {
  applying?: { entryId: string; mode: 'redo' | 'undo' } | null;
  pendingAction?: { entry: WorkspaceActionHistoryEntry; undoRequested: boolean } | null;
  pendingCreate?: WorkspaceStructurePendingCreate | null;
  redoStack: WorkspaceActionHistoryEntry[];
  undoStack: WorkspaceActionHistoryEntry[];
}

export function createEmptyWorkspaceActionHistory(): WorkspaceActionHistoryState {
  return { applying: null, pendingAction: null, pendingCreate: null, redoStack: [], undoStack: [] };
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

export function beginWorkspaceAction(
  history: WorkspaceActionHistoryState,
  entry: WorkspaceActionHistoryEntry
): WorkspaceActionHistoryState {
  return { ...history, pendingAction: { entry, undoRequested: false } };
}

export function failWorkspaceAction(history: WorkspaceActionHistoryState, entryId: string) {
  return history.pendingAction?.entry.id === entryId ? { ...history, pendingAction: null } : history;
}

export function settleWorkspaceAction(history: WorkspaceActionHistoryState, entryId: string) {
  const pending = history.pendingAction;
  if (!pending || pending.entry.id !== entryId) return { history, undoRequested: false };
  return {
    history: pushWorkspaceUndoEntry({ ...history, pendingAction: null }, pending.entry),
    undoRequested: pending.undoRequested
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

function requestPendingUndo(set: WorkspaceSet, expectedEntryId?: string) {
  let requested = false;
  set((state) => {
    const history = state.appActionHistory;
    const pending = history.pendingAction ?? history.pendingCreate;
    if (!pending || (expectedEntryId && pending.entry.id !== expectedEntryId)) return state;
    requested = true;
    if (history.pendingAction) {
      return {
        appActionHistory: {
          ...history,
          pendingAction: { ...history.pendingAction, undoRequested: true }
        }
      };
    }
    return {
      appActionHistory: {
        ...history,
        pendingCreate: { ...history.pendingCreate!, undoRequested: true }
      }
    };
  });
  return requested;
}

function createApplyWorkspaceHistoryAction(set: WorkspaceSet, get: WorkspaceGet, mode: 'redo' | 'undo') {
  return (expectedEntryId?: string) => {
    const snapshot = get();
    if (snapshot.appActionHistory.applying) return false;
    if (snapshot.appActionHistory.pendingAction || snapshot.appActionHistory.pendingCreate) {
      return mode === 'undo' && requestPendingUndo(set, expectedEntryId);
    }
    const entry = getTopEntry(snapshot.appActionHistory, mode);
    if (!entry || (expectedEntryId && entry.id !== expectedEntryId)) return false;
    set((state) => ({
      appActionHistory: { ...state.appActionHistory, applying: { entryId: entry.id, mode } }
    }));
    void applyWorkspaceHistoryEntry({ entry, get, mode }).then((result) => {
      set((state) => {
        const applying = state.appActionHistory.applying;
        const top = getTopEntry(state.appActionHistory, mode);
        if (applying?.entryId !== entry.id || applying.mode !== mode) return state;
        if (top?.id !== entry.id || result.status === 'invalid') {
          return { appActionHistory: createEmptyWorkspaceActionHistory() };
        }
        if (result.status === 'failed') {
          return { appActionHistory: { ...state.appActionHistory, applying: null } };
        }
        return {
          ...result.patch,
          appActionHistory: moveHistoryCursor(state.appActionHistory, result.entry, mode)
        };
      });
    });
    return true;
  };
}

export function getWorkspaceUndoTitle(history: WorkspaceActionHistoryState, t?: Translate) {
  const entry = history.pendingAction?.entry ?? history.pendingCreate?.entry ??
    history.undoStack[history.undoStack.length - 1] ?? null;
  if (!t) return entry ? `Undo ${entry.title}` : 'Undo';
  return entry ? t('desktop.command.undoOperation', { operation: entry.title }) : t('desktop.command.undo');
}

export function getWorkspaceRedoTitle(history: WorkspaceActionHistoryState, t?: Translate) {
  const entry = history.redoStack[history.redoStack.length - 1] ?? null;
  if (!t) return entry ? `Redo ${entry.title}` : 'Redo';
  return entry ? t('desktop.command.redoOperation', { operation: entry.title }) : t('desktop.command.redo');
}

export function createWorkspaceActionHistoryActions(set: WorkspaceSet, get: WorkspaceGet) {
  return {
    redoWorkspaceAction: createApplyWorkspaceHistoryAction(set, get, 'redo'),
    undoWorkspaceAction: createApplyWorkspaceHistoryAction(set, get, 'undo')
  };
}
