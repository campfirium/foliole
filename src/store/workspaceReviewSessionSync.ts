import { isCanonicalVisibleNodeId } from './workspaceCanonicalSelectors';
import { createEmptyReviewSession, isReviewSessionCompleted } from './workspaceReviewReading';
import type { WorkspaceState } from './workspaceStore';

function isVisibleQueuedNode(state: WorkspaceState, nodeId: string) {
  return isCanonicalVisibleNodeId({
    nodeOrder: state.nodeOrder,
    nodesById: state.nodesById,
    trashedNodeDeletedAtById: state.trashedNodeDeletedAtById,
    trashedNodeIds: state.trashedNodeIds
  }, nodeId);
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
    if (isReviewSessionCompleted(state.reviewSession)) {
      return state.reviewSession;
    }
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
