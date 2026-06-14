import type { Node, NodeReadingProfile } from '../features/nodes/model/nodeTypes';

import {
  applyReadingSnapshot,
  applyRelatedReadingSnapshots,
  areRelatedReadingsValid,
  cloneReadingProfile,
  cloneRelatedReadings,
  isSameReadingProfile
} from './workspaceActionHistoryReading';
import { cloneReviewSession } from './workspaceDeleteActionHistory';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { markNodeOpenedViewState } from './workspaceStoreOpenedNodeView';

const DISMISS_TOPIC_ACTION_TITLE = 'Dismiss Topic';
export type WorkspaceTopicReadingActionTitle =
  'Read Topic' | 'Later Topic' | 'Soon Topic' | 'Postpone Topic' | typeof DISMISS_TOPIC_ACTION_TITLE;

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

export interface WorkspaceTopicDismissHistoryEntry {
  afterReading: NodeReadingProfile | null;
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

export function createTopicDismissHistoryEntry(args: {
  afterReading: NodeReadingProfile | null | undefined;
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
    afterReading: cloneReadingProfile(args.afterReading),
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

function resolveHistoryApply(entry: WorkspaceTopicDismissHistoryEntry, mode: 'redo' | 'undo') {
  const expectedReading = mode === 'undo' ? entry.afterReading : entry.beforeReading;
  const nextReading = mode === 'undo' ? entry.beforeReading : entry.afterReading;
  const relatedReadings = (entry.relatedReadings ?? []).map((reading) => ({
    expectedReading: mode === 'undo' ? reading.afterReading : reading.beforeReading,
    nextReading: mode === 'undo' ? reading.beforeReading : reading.afterReading,
    nodeId: reading.nodeId
  }));
  return { expectedReading, nextReading, relatedReadings };
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

export function applyTopicDismissWorkspaceHistory(args: {
  entry: WorkspaceTopicDismissHistoryEntry;
  mode: 'redo' | 'undo';
  now: string;
  popInvalidTopEntry: (history: WorkspaceState['appActionHistory'], mode: 'redo' | 'undo') => WorkspaceState['appActionHistory'];
  set: WorkspaceSet;
  updateHistoryAfterApply: (
    history: WorkspaceState['appActionHistory'],
    entry: WorkspaceTopicDismissHistoryEntry,
    mode: 'redo' | 'undo'
  ) => WorkspaceState['appActionHistory'];
}) {
  const apply = resolveHistoryApply(args.entry, args.mode);
  let nextNodesForSync: Node[] = [];
  args.set((state) => {
    const node = state.nodesById[args.entry.nodeId];
    const isInvalid =
      !node ||
      state.trashedNodeIds.includes(args.entry.nodeId) ||
      !isSameReadingProfile(node.reading, apply.expectedReading) ||
      !areRelatedReadingsValid(apply.relatedReadings, state.nodesById);
    if (isInvalid) {
      return { appActionHistory: args.popInvalidTopEntry(state.appActionHistory, args.mode) };
    }
    const nextNode = applyReadingSnapshot(node, apply.nextReading, args.now);
    const nextNodesById = {
      ...state.nodesById,
      [args.entry.nodeId]: nextNode
    };
    applyRelatedReadingSnapshots({ nextNodesById, now: args.now, readings: apply.relatedReadings });
    nextNodesForSync = [
      nextNode,
      ...apply.relatedReadings
        .map((related) => nextNodesById[related.nodeId])
        .filter((relatedNode): relatedNode is Node => Boolean(relatedNode))
    ];
    return {
      ...getNavigationPatchAfterApply(state, args.entry, args.mode),
      appActionHistory: args.updateHistoryAfterApply(state.appActionHistory, args.entry, args.mode),
      nodesById: nextNodesById
    };
  });
  if (nextNodesForSync.length === 0) return false;
  nextNodesForSync.forEach((node) => syncNodeContentToRuntime(node));
  return true;
}
