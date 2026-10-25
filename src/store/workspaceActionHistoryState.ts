import type { WorkspaceActionHistoryEntry } from './workspaceActionHistoryEntry';
import type { WorkspaceNodeMetadataHistoryEntry } from './workspaceNodeMetadataHistory';
import type { WorkspaceStructurePendingCreate } from './workspaceStructureHistoryTypes';

const ACTION_HISTORY_LIMIT = 50;

export interface WorkspaceActionHistoryState<Entry = WorkspaceActionHistoryEntry> {
  applying?: { entryId: string; mode: 'redo' | 'undo' } | null;
  pendingAction?: { entry: WorkspaceActionHistoryEntry; undoRequested: boolean } | null;
  pendingCreate?: WorkspaceStructurePendingCreate | null;
  redoStack: Entry[];
  undoStack: Entry[];
}

export function createEmptyWorkspaceActionHistory<Entry = WorkspaceActionHistoryEntry>(): WorkspaceActionHistoryState<Entry> {
  return { applying: null, pendingAction: null, pendingCreate: null, redoStack: [], undoStack: [] };
}

function trimHistoryStack<Entry>(stack: Entry[]) {
  return stack.slice(Math.max(0, stack.length - ACTION_HISTORY_LIMIT));
}

export function pushWorkspaceUndoEntry<Entry>(
  history: WorkspaceActionHistoryState<Entry>,
  entry: Entry
): WorkspaceActionHistoryState<Entry> {
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

export function getWorkspaceHistoryTopEntry<Entry>(history: WorkspaceActionHistoryState<Entry>, mode: 'redo' | 'undo') {
  const stack = mode === 'undo' ? history.undoStack : history.redoStack;
  return stack[stack.length - 1] ?? null;
}

export function moveWorkspaceHistoryCursor<Entry extends WorkspaceActionHistoryEntry | WorkspaceNodeMetadataHistoryEntry>(
  history: WorkspaceActionHistoryState<Entry>,
  entry: Entry,
  mode: 'redo' | 'undo'
): WorkspaceActionHistoryState<Entry> {
  if (mode === 'undo') {
    return {
      ...history,
      applying: null,
      redoStack: trimHistoryStack([...history.redoStack, entry]),
      undoStack: rebaseExpectedReview(history.undoStack.slice(0, -1), entry, mode)
    };
  }
  return {
    ...history,
    applying: null,
    redoStack: rebaseExpectedReview(history.redoStack.slice(0, -1), entry, mode),
    undoStack: trimHistoryStack([...history.undoStack, entry])
  };
}

function rebaseExpectedReview<Entry extends WorkspaceActionHistoryEntry | WorkspaceNodeMetadataHistoryEntry>(
  stack: Entry[], moved: Entry, mode: 'redo' | 'undo'
): Entry[] {
  if (moved.type !== 'review.grade') return stack;
  const index = stack.findLastIndex(candidate => candidate.type === 'review.grade' && candidate.nodeId === moved.nodeId);
  if (index < 0) return stack;
  const review = mode === 'undo' ? moved.beforeReview : moved.afterReview;
  return stack.map((candidate, i) => i !== index ? candidate : { ...candidate,
    ...(mode === 'undo' ? { afterReview: review } : { beforeReview: review }) });
}
