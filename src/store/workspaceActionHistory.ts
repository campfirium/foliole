import type { Node, NodeReadingProfile } from '../features/nodes/model/nodeTypes';

import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { markNodeOpenedViewState } from './workspaceStoreOpenedNodeView';

const ACTION_HISTORY_LIMIT = 50;
const DISMISS_TOPIC_ACTION_TITLE = 'Dismiss Topic';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;
type WorkspaceGet = () => WorkspaceState;

export interface WorkspaceTopicDismissHistoryEntry {
  afterReading: NodeReadingProfile;
  afterReviewSession?: WorkspaceState['reviewSession'] | null;
  beforeReading: NodeReadingProfile | null;
  beforeReviewSession?: WorkspaceState['reviewSession'] | null;
  nodeId: string;
  title: typeof DISMISS_TOPIC_ACTION_TITLE;
  type: 'topic.dismiss';
}

export type WorkspaceActionHistoryEntry = WorkspaceTopicDismissHistoryEntry;

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

export function cloneReadingProfile(reading: NodeReadingProfile | null | undefined): NodeReadingProfile | null {
  return reading ? { ...reading } : null;
}

function cloneReviewSession(
  reviewSession: WorkspaceState['reviewSession'] | null | undefined
): WorkspaceState['reviewSession'] | null {
  return reviewSession
    ? {
        ...reviewSession,
        queueNodeIds: [...reviewSession.queueNodeIds]
      }
    : null;
}

function isSameReadingProfile(
  left: NodeReadingProfile | null | undefined,
  right: NodeReadingProfile | null | undefined
) {
  const a = left ?? null;
  const b = right ?? null;
  if (!a || !b) {
    return a === b;
  }
  return (
    a.intervalDurationMs === b.intervalDurationMs &&
    a.intervalGrowthFactor === b.intervalGrowthFactor &&
    a.lastHandledAt === b.lastHandledAt &&
    a.nextAt === b.nextAt &&
    a.priority === b.priority &&
    a.readingPosition === b.readingPosition &&
    a.repetitionCount === b.repetitionCount &&
    a.state === b.state
  );
}

export function createTopicDismissHistoryEntry(args: {
  afterReading: NodeReadingProfile;
  afterReviewSession?: WorkspaceState['reviewSession'] | null;
  beforeReading: NodeReadingProfile | null | undefined;
  beforeReviewSession?: WorkspaceState['reviewSession'] | null;
  nodeId: string;
}): WorkspaceTopicDismissHistoryEntry {
  return {
    afterReading: cloneReadingProfile(args.afterReading)!,
    afterReviewSession: cloneReviewSession(args.afterReviewSession),
    beforeReading: cloneReadingProfile(args.beforeReading),
    beforeReviewSession: cloneReviewSession(args.beforeReviewSession),
    nodeId: args.nodeId,
    title: DISMISS_TOPIC_ACTION_TITLE,
    type: 'topic.dismiss'
  };
}

export function pushWorkspaceUndoEntry(
  history: WorkspaceActionHistoryState,
  entry: WorkspaceActionHistoryEntry
): WorkspaceActionHistoryState {
  return {
    redoStack: [],
    undoStack: trimHistoryStack([...history.undoStack, entry])
  };
}

function popStack(stack: WorkspaceActionHistoryEntry[]) {
  return stack.slice(0, -1);
}

function applyReadingSnapshot(node: Node, reading: NodeReadingProfile | null, now: string): Node {
  return {
    ...node,
    reading: cloneReadingProfile(reading),
    updatedAt: now
  };
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

function resolveHistoryApply(args: {
  history: WorkspaceActionHistoryState;
  mode: 'redo' | 'undo';
}) {
  const entry = getTopEntry(args.history, args.mode);
  if (!entry) {
    return null;
  }
  const expectedReading = args.mode === 'undo' ? entry.afterReading : entry.beforeReading;
  const nextReading = args.mode === 'undo' ? entry.beforeReading : entry.afterReading;
  return { entry, expectedReading, nextReading };
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

function getNavigationPatchAfterApply(
  state: WorkspaceState,
  entry: WorkspaceActionHistoryEntry,
  mode: 'redo' | 'undo'
) {
  const reviewSession = mode === 'undo' ? entry.beforeReviewSession : entry.afterReviewSession;
  if (reviewSession) {
    const activeNodeId = reviewSession.currentNodeId ?? entry.nodeId;
    return {
      activeNodeId,
      nodeViewById: markNodeOpenedViewState(state, activeNodeId),
      reviewSession: cloneReviewSession(reviewSession) ?? state.reviewSession
    };
  }
  if (mode === 'undo') {
    return {
      activeNodeId: entry.nodeId,
      nodeViewById: markNodeOpenedViewState(state, entry.nodeId)
    };
  }
  return {};
}

function createApplyWorkspaceHistoryAction(
  set: WorkspaceSet,
  get: WorkspaceGet,
  mode: 'redo' | 'undo'
) {
  return (now = new Date().toISOString()) => {
    const snapshot = get();
    const apply = resolveHistoryApply({ history: snapshot.appActionHistory, mode });
    if (!apply) {
      return false;
    }
    const node = snapshot.nodesById[apply.entry.nodeId];
    const isInvalid =
      !node ||
      snapshot.trashedNodeIds.includes(apply.entry.nodeId) ||
      !isSameReadingProfile(node.reading, apply.expectedReading);
    let nextNodeForSync: Node | null = null;
    set((state) => {
      if (isInvalid) {
        return { appActionHistory: popInvalidTopEntry(state.appActionHistory, mode) };
      }
      const currentNode = state.nodesById[apply.entry.nodeId];
      if (!currentNode) {
        return { appActionHistory: popInvalidTopEntry(state.appActionHistory, mode) };
      }
      const nextNode = applyReadingSnapshot(currentNode, apply.nextReading, now);
      nextNodeForSync = nextNode;
      return {
        ...getNavigationPatchAfterApply(state, apply.entry, mode),
        appActionHistory: updateHistoryAfterApply(state.appActionHistory, apply.entry, mode),
        nodesById: {
          ...state.nodesById,
          [apply.entry.nodeId]: nextNode
        }
      };
    });
    if (nextNodeForSync) {
      syncNodeContentToRuntime(nextNodeForSync);
      return true;
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
