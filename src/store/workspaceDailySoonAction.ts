import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';

import { persistAndApplyReadingReviewPatch } from './workspaceReadingReviewHistoryCommit';
import { buildReviewActiveNodeContext } from './workspaceReviewBrowseRoot';
import { runtimeWorkspaceReviewPersistence } from './workspaceReviewPersistence';
import { calculateReviewStepElapsedMs } from './workspaceReviewSessionProgress';
import { advanceAfterSoonAction, isExistingQueueTopic } from './workspaceStoreReadingReviewSessionFlow';
import { createReadingReviewHistoryEntry } from './workspaceStoreReviewActionHelpers';
import type { WorkspaceState } from './workspaceStoreTypes';

type Set = (partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState>)) => void;

export function createRevisitReviewTopicSoonAction(set: Set, get: () => WorkspaceState): WorkspaceState['revisitReviewTopicSoon'] {
  const pendingNodeIds = new Set<string>();
  return async (now = new Date().toISOString()) => {
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId || snapshot.activeNodeId !== currentNodeId || pendingNodeIds.has(currentNodeId) ||
      !isReadingReviewItemNode(snapshot.nodesById[currentNodeId])) return false;
    const result = await persistAndApplyReadingReviewPatch({ currentNodeId, get, set, pendingNodeIds,
      persistence: runtimeWorkspaceReviewPersistence, buildPatch: state => {
        const node = state.nodesById[currentNodeId];
        if (!node) return null;
        const reviewSession = advanceAfterSoonAction({ currentNodeId, now, snapshot, state,
          readingElapsedMsDelta: calculateReviewStepElapsedMs(snapshot.reviewSession, now),
          progressDelta: isExistingQueueTopic(snapshot.reviewSession, currentNodeId) ? 1 : 0 });
        const active = buildReviewActiveNodeContext(state, reviewSession.currentNodeId ?? reviewSession.continueNodeId ?? null);
        const historyEntry = createReadingReviewHistoryEntry({ afterActiveNodeId: active.activeNodeId,
          ...('browseRootNodeId' in active ? { afterBrowseRootNodeId: active.browseRootNodeId } : {}),
          afterReading: node.reading, afterReviewSession: reviewSession, beforeReading: node.reading,
          beforeReviewSession: snapshot.reviewSession, mutationTimestamp: now, nodeId: currentNodeId,
          state, title: 'Soon Topic' });
        return { historyEntry, nextNodesForSync: [], patch: { ...active, reviewSession } };
      } });
    return Boolean(result);
  };
}
