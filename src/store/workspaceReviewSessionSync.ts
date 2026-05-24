import { isCanonicalVisibleNodeId } from './workspaceCanonicalSelectors';
import { createEmptyReviewSession } from './workspaceReviewReading';
import type { WorkspaceState } from './workspaceStore';

interface ReconcileReviewSessionOptions {
  preferActiveQueuedNode?: boolean;
}

function isVisibleQueuedNode(state: WorkspaceState, nodeId: string) {
  return isCanonicalVisibleNodeId({
    nodeOrder: state.nodeOrder,
    nodesById: state.nodesById,
    trashedNodeDeletedAtById: state.trashedNodeDeletedAtById,
    trashedNodeIds: state.trashedNodeIds
  }, nodeId);
}

function placeActiveQueuedNodeFirst(queueNodeIds: string[], nextActiveNodeId: string | null) {
  if (!nextActiveNodeId || queueNodeIds[0] === nextActiveNodeId || !queueNodeIds.includes(nextActiveNodeId)) {
    return queueNodeIds;
  }
  return [nextActiveNodeId, ...queueNodeIds.filter((nodeId) => nodeId !== nextActiveNodeId)];
}

export function reconcileReviewSession(
  state: WorkspaceState,
  nextActiveNodeId: string | null = state.activeNodeId,
  options: ReconcileReviewSessionOptions = {}
): WorkspaceState['reviewSession'] {
  const visibleQueuedNodeIds = state.reviewSession.queueNodeIds.filter((nodeId) =>
    isVisibleQueuedNode(state, nodeId)
  );
  const queuedNodeIds = options.preferActiveQueuedNode
    ? placeActiveQueuedNodeFirst(visibleQueuedNodeIds, nextActiveNodeId)
    : visibleQueuedNodeIds;
  if (queuedNodeIds.length === 0) {
    return createEmptyReviewSession();
  }

  const removedQueueCount = state.reviewSession.queueNodeIds.length - visibleQueuedNodeIds.length;
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
