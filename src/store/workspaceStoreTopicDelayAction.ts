import { readWorkspaceOperationLearning } from '../shared/platform/runtime/workspaceOperationLearning';

import { buildTopicDelayReading, canDelayTopic } from './topicDelayReading';
import { isSameReadingProfile } from './workspaceActionHistoryReading';
import { persistAndApplyReadingReviewPatch, type ReadingReviewPatchResult, type ReadingReviewPendingNodeIds } from './workspaceReadingReviewHistoryCommit';
import { runtimeWorkspaceReviewPersistence, type WorkspaceReviewPersistenceAdapter } from './workspaceReviewPersistence';
import type { WorkspaceState } from './workspaceStore';
import { persistNodeOpened } from './workspaceStoreNodeOpenState';
import { createReadingReviewHistoryEntry } from './workspaceStoreReviewActionHelpers';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;
type WorkspaceGet = () => WorkspaceState;

function buildTopicDelayPatch(args: {
  level: number;
  unit: 'weeks' | 'days';
  nodeId: string;
  now: string;
  snapshot: WorkspaceState;
  state: WorkspaceState;
}): ReadingReviewPatchResult | null {
  const node = args.state.nodesById[args.nodeId];
  if (args.state.trashedNodeIds.includes(args.nodeId) || !canDelayTopic(node)) return null;
  const nextReading = buildTopicDelayReading({ nodeId: args.nodeId, level: args.level, unit: args.unit, now: args.now,
    nodesById: args.state.nodesById });
  if (!nextReading) return null;
  const nextNode = { ...node, reading: nextReading };
  const nextNodesById = { ...args.state.nodesById, [args.nodeId]: nextNode };
  const reviewSession = args.state.reviewSession;
  const afterActiveNodeId = reviewSession.currentNodeId ?? reviewSession.continueNodeId ?? args.state.activeNodeId;
  return {
    historyEntry: createReadingReviewHistoryEntry({
      afterActiveNodeId,
      afterReading: nextReading,
      afterReviewSession: reviewSession,
      beforeReading: node.reading,
      beforeReviewSession: args.snapshot.reviewSession,
      mutationTimestamp: args.now,
      nodeId: args.nodeId,
      state: args.state,
      title: 'Postpone Topic'
    }),
    nextNodesForSync: [nextNode],
    patch: {
      activeNodeId: afterActiveNodeId,
      nodesById: nextNodesById,
      reviewSession
    }
  };
}

export function createSetReviewTopicDelayActionWithPending(
  set: WorkspaceSet,
  get: WorkspaceGet,
  pendingNodeIds: ReadingReviewPendingNodeIds,
  persistence: WorkspaceReviewPersistenceAdapter = runtimeWorkspaceReviewPersistence
): WorkspaceState['setReviewTopicDelay'] {
  return async (nodeId, level, now = new Date().toISOString(), expectedReading, unit = 'weeks') => {
    const snapshot = get();
    if (!canDelayTopic(snapshot.nodesById[nodeId]) || pendingNodeIds.has(nodeId)) return false;
    const committed = await persistAndApplyReadingReviewPatch({ currentNodeId: nodeId, get, set, pendingNodeIds, persistence,
      buildPatch: async state => {
        const nodesById = await readWorkspaceOperationLearning(state.nodesById, [nodeId],
          state.libraryScope ?? state.reviewSession.daily?.scope);
        if (!nodesById || (expectedReading !== undefined && !isSameReadingProfile(nodesById[nodeId]?.reading, expectedReading))) return null;
        return buildTopicDelayPatch({ level, unit, nodeId, now, snapshot, state: { ...state, nodesById } });
      } });
    if (committed && committed.nextActiveNodeId) void persistNodeOpened(set, committed.nextActiveNodeId, now);
    return Boolean(committed);
  };
}
