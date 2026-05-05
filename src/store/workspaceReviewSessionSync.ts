import { createEmptyReviewSession } from './workspaceReviewReading';
import type { WorkspaceState } from './workspaceStore';

function isVisibleQueuedNode(state: WorkspaceState, nodeId: string) {
  return Boolean(state.nodesById[nodeId]) && !state.trashedNodeIds.includes(nodeId);
}

export function reconcileReviewSession(
  state: WorkspaceState,
  nextActiveNodeId: string | null = state.activeNodeId
): WorkspaceState['reviewSession'] {
  const queuedNodeIds = state.reviewSession.queueNodeIds.filter((nodeId) =>
    isVisibleQueuedNode(state, nodeId)
  );
  if (queuedNodeIds.length === 0) {
    return createEmptyReviewSession();
  }

  const removedQueueCount = state.reviewSession.queueNodeIds.length - queuedNodeIds.length;
  const nextTotalNodeCount = Math.max(
    queuedNodeIds.length,
    state.reviewSession.totalNodeCount - removedQueueCount
  );
  const currentNodeId = state.reviewSession.currentNodeId;
  const currentQueuedNodeId =
    currentNodeId && queuedNodeIds.includes(currentNodeId) ? currentNodeId : null;
  const syncedQueuedNodeId =
    nextActiveNodeId && queuedNodeIds.includes(nextActiveNodeId) ? nextActiveNodeId : null;
  const nextCurrentNodeId = syncedQueuedNodeId ?? currentQueuedNodeId ?? queuedNodeIds[0] ?? null;
  if (!nextCurrentNodeId) {
    return createEmptyReviewSession();
  }

  const nextQueueNodeIds = [
    nextCurrentNodeId,
    ...queuedNodeIds.filter((nodeId) => nodeId !== nextCurrentNodeId)
  ];
  const canKeepAnswerRevealed =
    nextCurrentNodeId === state.reviewSession.currentNodeId &&
    nextCurrentNodeId === state.reviewSession.queueNodeIds[0];

  return {
    currentNodeId: nextCurrentNodeId,
    isAnswerRevealed: canKeepAnswerRevealed ? state.reviewSession.isAnswerRevealed : false,
    queueNodeIds: nextQueueNodeIds,
    totalNodeCount: nextTotalNodeCount
  };
}
