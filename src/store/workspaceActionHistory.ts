import {
  applyTopicDeleteWorkspaceHistory,
  type WorkspaceTopicDeleteHistoryEntry
} from './workspaceDeleteActionHistory';
import {
  applyReviewGradeWorkspaceHistory,
  type WorkspaceReviewGradeHistoryEntry
} from './workspaceReviewGradeActionHistory';
import {
  applyTopicShelveWorkspaceHistory,
  type WorkspaceTopicShelveHistoryEntry
} from './workspaceShelveActionHistory';
import type { WorkspaceState } from './workspaceStore';
import {
  applyTopicDismissWorkspaceHistory,
  type WorkspaceTopicDismissHistoryEntry,
} from './workspaceTopicDismissActionHistory';

export { cloneReadingProfile } from './workspaceActionHistoryReading';
export {
  createTopicDismissHistoryEntry,
  type WorkspaceTopicDismissHistoryEntry,
  type WorkspaceTopicReadingActionTitle
} from './workspaceTopicDismissActionHistory';

const ACTION_HISTORY_LIMIT = 50;

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;
type WorkspaceGet = () => WorkspaceState;

export type WorkspaceActionHistoryEntry =
  | WorkspaceReviewGradeHistoryEntry
  | WorkspaceTopicDeleteHistoryEntry
  | WorkspaceTopicDismissHistoryEntry
  | WorkspaceTopicShelveHistoryEntry;

export interface WorkspaceActionHistoryState {
  redoStack: WorkspaceActionHistoryEntry[];
  undoStack: WorkspaceActionHistoryEntry[];
}

export function createEmptyWorkspaceActionHistory(): WorkspaceActionHistoryState {
  return { redoStack: [], undoStack: [] };
}

function trimHistoryStack(stack: WorkspaceActionHistoryEntry[]) {
  return stack.slice(Math.max(0, stack.length - ACTION_HISTORY_LIMIT));
}

export function pushWorkspaceUndoEntry(history: WorkspaceActionHistoryState, entry: WorkspaceActionHistoryEntry): WorkspaceActionHistoryState {
  return {
    redoStack: [],
    undoStack: trimHistoryStack([...history.undoStack, entry])
  };
}

function popStack(stack: WorkspaceActionHistoryEntry[]) {
  return stack.slice(0, -1);
}

function popInvalidTopEntry(
  history: WorkspaceActionHistoryState,
  mode: 'redo' | 'undo'
): WorkspaceActionHistoryState {
  return mode === 'undo'
    ? { ...history, undoStack: popStack(history.undoStack) }
    : { ...history, redoStack: popStack(history.redoStack) };
}

function getTopEntry(history: WorkspaceActionHistoryState, mode: 'redo' | 'undo') {
  const stack = mode === 'undo' ? history.undoStack : history.redoStack;
  return stack[stack.length - 1] ?? null;
}

function updateHistoryAfterApply(
  history: WorkspaceActionHistoryState,
  entry: WorkspaceActionHistoryEntry,
  mode: 'redo' | 'undo'
): WorkspaceActionHistoryState {
  if (mode === 'undo') {
    return {
      redoStack: trimHistoryStack([...history.redoStack, entry]),
      undoStack: popStack(history.undoStack)
    };
  }
  return {
    redoStack: popStack(history.redoStack),
    undoStack: trimHistoryStack([...history.undoStack, entry])
  };
}

function createApplyWorkspaceHistoryAction(
  set: WorkspaceSet,
  get: WorkspaceGet,
  mode: 'redo' | 'undo'
) {
  return (now = new Date().toISOString()) => {
    const snapshot = get();
    const entry = getTopEntry(snapshot.appActionHistory, mode);
    if (entry?.type === 'topic.delete') {
      return applyTopicDeleteWorkspaceHistory({ entry, mode, popInvalidTopEntry, set, updateHistoryAfterApply });
    }
    if (entry?.type === 'topic.shelve') {
      return applyTopicShelveWorkspaceHistory({ entry, mode, now, popInvalidTopEntry, set, updateHistoryAfterApply });
    }
    if (entry?.type === 'review.grade') {
      return applyReviewGradeWorkspaceHistory({ entry, mode, now, popInvalidTopEntry, set, updateHistoryAfterApply });
    }
    if (entry?.type === 'topic.dismiss') {
      return applyTopicDismissWorkspaceHistory({ entry, mode, now, popInvalidTopEntry, set, updateHistoryAfterApply });
    }
    return false;
  };
}

export function getWorkspaceUndoTitle(history: WorkspaceActionHistoryState) {
  const entry = history.undoStack[history.undoStack.length - 1] ?? null;
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
