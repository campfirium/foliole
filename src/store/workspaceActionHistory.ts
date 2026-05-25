import type { Node, NodeReadingProfile } from '../features/nodes/model/nodeTypes';

import {
  applyReadingSnapshot,
  applyRelatedReadingSnapshots,
  areRelatedReadingsValid,
  cloneReadingProfile,
  cloneRelatedReadings,
  isSameReadingProfile
} from './workspaceActionHistoryReading';
import {
  applyTopicDeleteWorkspaceHistory,
  cloneReviewSession,
  type WorkspaceTopicDeleteHistoryEntry
} from './workspaceDeleteActionHistory';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { markNodeOpenedViewState } from './workspaceStoreOpenedNodeView';

export { cloneReadingProfile } from './workspaceActionHistoryReading';

const ACTION_HISTORY_LIMIT = 50;
const DISMISS_TOPIC_ACTION_TITLE = 'Dismiss Topic';
export type WorkspaceTopicReadingActionTitle = 'Read Topic' | 'Later Topic' | 'Soon Topic' | 'Postpone Topic' | typeof DISMISS_TOPIC_ACTION_TITLE;

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
  relatedReadings?: Array<{
    afterReading: NodeReadingProfile | null;
    beforeReading: NodeReadingProfile | null;
    nodeId: string;
  }>;
  title: WorkspaceTopicReadingActionTitle;
  type: 'topic.dismiss';
}

export type WorkspaceActionHistoryEntry = WorkspaceTopicDeleteHistoryEntry | WorkspaceTopicDismissHistoryEntry;

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

export function createTopicDismissHistoryEntry(args: {
  afterReading: NodeReadingProfile;
  afterReviewSession?: WorkspaceState['reviewSession'] | null;
  beforeReading: NodeReadingProfile | null | undefined;
  beforeReviewSession?: WorkspaceState['reviewSession'] | null;
  nodeId: string;
  relatedReadings?: Array<{
    afterReading: NodeReadingProfile | null | undefined;
    beforeReading: NodeReadingProfile | null | undefined;
    nodeId: string;
  }>;
  title?: WorkspaceTopicReadingActionTitle;
}): WorkspaceTopicDismissHistoryEntry {
  const entry: WorkspaceTopicDismissHistoryEntry = {
    afterReading: cloneReadingProfile(args.afterReading)!,
    afterReviewSession: cloneReviewSession(args.afterReviewSession),
    beforeReading: cloneReadingProfile(args.beforeReading),
    beforeReviewSession: cloneReviewSession(args.beforeReviewSession),
    nodeId: args.nodeId,
    title: args.title ?? DISMISS_TOPIC_ACTION_TITLE,
    type: 'topic.dismiss'
  };
  if (args.relatedReadings?.length) entry.relatedReadings = cloneRelatedReadings(args.relatedReadings) ?? [];
  return entry;
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

function resolveHistoryApply(args: {
  history: WorkspaceActionHistoryState;
  mode: 'redo' | 'undo';
}) {
  const entry = getTopEntry(args.history, args.mode);
  if (!entry || entry.type !== 'topic.dismiss') {
    return null;
  }
  const expectedReading = args.mode === 'undo' ? entry.afterReading : entry.beforeReading;
  const nextReading = args.mode === 'undo' ? entry.beforeReading : entry.afterReading;
  const relatedReadings = (entry.relatedReadings ?? []).map((reading) => ({
    expectedReading: args.mode === 'undo' ? reading.afterReading : reading.beforeReading,
    nextReading: args.mode === 'undo' ? reading.beforeReading : reading.afterReading,
    nodeId: reading.nodeId
  }));
  return { entry, expectedReading, nextReading, relatedReadings };
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
  entry: WorkspaceTopicDismissHistoryEntry,
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
    const entry = getTopEntry(snapshot.appActionHistory, mode);
    if (entry?.type === 'topic.delete') {
      return applyTopicDeleteWorkspaceHistory({ entry, mode, popInvalidTopEntry, set, updateHistoryAfterApply });
    }
    const apply = resolveHistoryApply({ history: snapshot.appActionHistory, mode });
    if (!apply) {
      return false;
    }
    const node = snapshot.nodesById[apply.entry.nodeId];
    const isInvalid =
      !node ||
      snapshot.trashedNodeIds.includes(apply.entry.nodeId) ||
      !isSameReadingProfile(node.reading, apply.expectedReading) ||
      !areRelatedReadingsValid(apply.relatedReadings, snapshot.nodesById);
    let nextNodesForSync: Node[] = [];
    set((state) => {
      if (isInvalid) {
        return { appActionHistory: popInvalidTopEntry(state.appActionHistory, mode) };
      }
      const currentNode = state.nodesById[apply.entry.nodeId];
      if (!currentNode) {
        return { appActionHistory: popInvalidTopEntry(state.appActionHistory, mode) };
      }
      const nextNode = applyReadingSnapshot(currentNode, apply.nextReading, now);
      const nextNodesById = {
        ...state.nodesById,
        [apply.entry.nodeId]: nextNode
      };
      applyRelatedReadingSnapshots({ nextNodesById, now, readings: apply.relatedReadings });
      nextNodesForSync = [nextNode, ...apply.relatedReadings
        .map((related) => nextNodesById[related.nodeId])
        .filter((relatedNode): relatedNode is Node => Boolean(relatedNode))];
      return {
        ...getNavigationPatchAfterApply(state, apply.entry, mode),
        appActionHistory: updateHistoryAfterApply(state.appActionHistory, apply.entry, mode),
        nodesById: nextNodesById
      };
    });
    if (nextNodesForSync.length > 0) {
      nextNodesForSync.forEach((node) => syncNodeContentToRuntime(node));
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
