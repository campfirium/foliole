import type { Translate } from '../shared/localization/LocalizationProvider';

import { createEmptyWorkspaceActionHistory, getWorkspaceHistoryTopEntry, moveWorkspaceHistoryCursor,
  type WorkspaceActionHistoryState } from './workspaceActionHistoryState';
import { resolveWorkspaceHistoryCommand } from './workspaceHistoryCommandState';
import { applyWorkspaceHistoryEntry } from './workspaceHistoryEntryApply';
import type { WorkspaceState } from './workspaceStore';
export { beginWorkspaceAction, beginWorkspaceStructureCreate, createEmptyWorkspaceActionHistory,
  failWorkspaceAction, failWorkspaceStructureCreate, pushWorkspaceUndoEntry, settleWorkspaceAction,
  settleWorkspaceStructureCreate, type WorkspaceActionHistoryState } from './workspaceActionHistoryState';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> |
  ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;
type WorkspaceGet = () => WorkspaceState;

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

function createApplyWorkspaceHistoryAction(set: WorkspaceSet, get: WorkspaceGet, mode: 'redo' | 'undo', awaitCommit = false) {
  return (expectedEntryId?: string) => {
    const snapshot = get();
    const command = resolveWorkspaceHistoryCommand(snapshot.appActionHistory, mode, expectedEntryId);
    if (!command) return false;
    if (command.phase === 'pending') return requestPendingUndo(set, expectedEntryId);
    const { entry } = command;
    set((state) => ({
      appActionHistory: { ...state.appActionHistory, applying: { entryId: entry.id, mode } }
    }));
    const committed = applyWorkspaceHistoryEntry({ entry, get, mode }).then((result) => {
      set((state) => {
        const applying = state.appActionHistory.applying;
        const top = getWorkspaceHistoryTopEntry(state.appActionHistory, mode);
        if (applying?.entryId !== entry.id || applying.mode !== mode) return state;
        if (top?.id !== entry.id || result.status === 'invalid') {
          return { appActionHistory: createEmptyWorkspaceActionHistory() };
        }
        if (result.status === 'failed') {
          return { appActionHistory: { ...state.appActionHistory, applying: null } };
        }
        return {
          ...result.patch,
          appActionHistory: moveWorkspaceHistoryCursor(state.appActionHistory, result.entry, mode)
        };
      });
      return result.status === 'applied';
    });
    return awaitCommit ? committed : true;
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

export function createAwaitedWorkspaceHistoryActions(set: WorkspaceSet, get: WorkspaceGet) {
  return {
    redoWorkspaceAction: createApplyWorkspaceHistoryAction(set, get, 'redo', true),
    undoWorkspaceAction: createApplyWorkspaceHistoryAction(set, get, 'undo', true)
  };
}
