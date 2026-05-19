import { createEmptyReviewSession } from './workspaceReviewReading';
import type { WorkspaceState } from './workspaceStore';

function isVisibleQueuedNode(state: WorkspaceState, nodeId: string) {
  return Boolean(state.nodesById[nodeId]) && !state.trashedNodeIds.includes(nodeId);
}

export function reconcileReviewSession(
  state: WorkspaceState,
  nextActiveNodeId: string | null = state.activeNodeId
): WorkspaceState['reviewSession'] {
  void nextActiveNodeId;
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
  const nextCurrentNodeId = queuedNodeIds[0] ?? null;
  if (!nextCurrentNodeId) {
    return createEmptyReviewSession();
  }

  const canKeepAnswerRevealed =
    nextCurrentNodeId === state.reviewSession.currentNodeId &&
    nextCurrentNodeId === state.reviewSession.queueNodeIds[0];

  return {
    ...state.reviewSession,
    completedAt: null,
    currentNodeId: nextCurrentNodeId,
    isAnswerRevealed: canKeepAnswerRevealed ? state.reviewSession.isAnswerRevealed : false,
    queueNodeIds: queuedNodeIds,
    totalNodeCount: nextTotalNodeCount
  };
}
