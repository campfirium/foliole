import type { Node } from '../features/nodes/model/nodeTypes';

import {
  applyRelatedReadingSnapshots,
  areRelatedReadingsValid,
  cloneRelatedReadings
} from './workspaceActionHistoryReading';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { markNodeOpenedViewState } from './workspaceStoreOpenedNodeView';

const SHELVE_TOPIC_ACTION_TITLE = 'Shelve Topic';
const UNSHELVE_TOPIC_ACTION_TITLE = 'Unshelve Topic';

export interface WorkspaceTopicShelveHistoryEntry {
  afterShelvedAt: string | null;
  afterReviewSession?: WorkspaceState['reviewSession'] | null;
  beforeShelvedAt: string | null;
  beforeReviewSession?: WorkspaceState['reviewSession'] | null;
  nodeId: string;
  relatedReadings?: Array<{
    afterReading: Node['reading'];
    beforeReading: Node['reading'];
    nodeId: string;
  }>;
  title: typeof SHELVE_TOPIC_ACTION_TITLE | typeof UNSHELVE_TOPIC_ACTION_TITLE;
  type: 'topic.shelve';
}

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

export function createTopicShelveHistoryEntry(args: {
  afterShelvedAt: string | null;
  afterReviewSession?: WorkspaceState['reviewSession'] | null;
  beforeShelvedAt: string | null;
  beforeReviewSession?: WorkspaceState['reviewSession'] | null;
  nodeId: string;
  relatedReadings?: Array<{
    afterReading: Node['reading'];
    beforeReading: Node['reading'];
    nodeId: string;
  }>;
}): WorkspaceTopicShelveHistoryEntry {
  const entry: WorkspaceTopicShelveHistoryEntry = {
    afterShelvedAt: args.afterShelvedAt,
    afterReviewSession: cloneReviewSession(args.afterReviewSession),
    beforeShelvedAt: args.beforeShelvedAt,
    beforeReviewSession: cloneReviewSession(args.beforeReviewSession),
    nodeId: args.nodeId,
    title: args.afterShelvedAt ? SHELVE_TOPIC_ACTION_TITLE : UNSHELVE_TOPIC_ACTION_TITLE,
    type: 'topic.shelve'
  };
  if (args.relatedReadings?.length) entry.relatedReadings = cloneRelatedReadings(args.relatedReadings) ?? [];
  return entry;
}

function cloneReviewSession(reviewSession: WorkspaceState['reviewSession'] | null | undefined) {
  return reviewSession
    ? {
        ...reviewSession,
        queueNodeIds: [...reviewSession.queueNodeIds],
        ...(reviewSession.soonNodeIds ? { soonNodeIds: [...reviewSession.soonNodeIds] } : {})
      }
    : null;
}

function getNavigationPatchAfterShelveApply(
  state: WorkspaceState,
  entry: WorkspaceTopicShelveHistoryEntry,
  mode: 'redo' | 'undo'
) {
  const reviewSession = mode === 'undo' ? entry.beforeReviewSession : entry.afterReviewSession;
  if (!reviewSession) return {};
  const activeNodeId = reviewSession.currentNodeId ?? entry.nodeId;
  return {
    activeNodeId,
    nodeViewById: markNodeOpenedViewState(state, activeNodeId),
    reviewSession: cloneReviewSession(reviewSession) ?? state.reviewSession
  };
}

export function applyTopicShelveWorkspaceHistory(args: {
  entry: WorkspaceTopicShelveHistoryEntry;
  mode: 'redo' | 'undo';
  now: string;
  popInvalidTopEntry: (history: WorkspaceState['appActionHistory'], mode: 'redo' | 'undo') => WorkspaceState['appActionHistory'];
  set: WorkspaceSet;
  updateHistoryAfterApply: (
    history: WorkspaceState['appActionHistory'],
    entry: WorkspaceTopicShelveHistoryEntry,
    mode: 'redo' | 'undo'
  ) => WorkspaceState['appActionHistory'];
}) {
  let nextNodesForSync: Node[] = [];
  args.set((state) => {
    const node = state.nodesById[args.entry.nodeId];
    const expectedShelvedAt = args.mode === 'undo' ? args.entry.afterShelvedAt : args.entry.beforeShelvedAt;
    const nextShelvedAt = args.mode === 'undo' ? args.entry.beforeShelvedAt : args.entry.afterShelvedAt;
    const relatedReadings = (args.entry.relatedReadings ?? []).map((reading) => ({
      expectedReading: args.mode === 'undo' ? reading.afterReading : reading.beforeReading,
      nextReading: args.mode === 'undo' ? reading.beforeReading : reading.afterReading,
      nodeId: reading.nodeId
    }));
    if (
      !node ||
      state.trashedNodeIds.includes(args.entry.nodeId) ||
      (node.shelvedAt ?? null) !== expectedShelvedAt ||
      !areRelatedReadingsValid(relatedReadings, state.nodesById)
    ) {
      return { appActionHistory: args.popInvalidTopEntry(state.appActionHistory, args.mode) };
    }
    const nextNode = {
      ...node,
      shelvedAt: nextShelvedAt,
      updatedAt: args.now
    };
    const nextNodesById = {
      ...state.nodesById,
      [args.entry.nodeId]: nextNode
    };
    applyRelatedReadingSnapshots({ nextNodesById, now: args.now, readings: relatedReadings });
    nextNodesForSync = [
      nextNode,
      ...relatedReadings
        .map((reading) => nextNodesById[reading.nodeId])
        .filter((relatedNode): relatedNode is Node => Boolean(relatedNode))
    ];
    return {
      ...getNavigationPatchAfterShelveApply(state, args.entry, args.mode),
      appActionHistory: args.updateHistoryAfterApply(state.appActionHistory, args.entry, args.mode),
      nodesById: nextNodesById
    };
  });
  if (nextNodesForSync.length === 0) return false;
  nextNodesForSync.forEach((node) => syncNodeContentToRuntime(node));
  return true;
}
