import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { buildLiveReviewQueueOutput } from './workspaceReviewLiveQueue';
import { resolveReviewSessionProgress } from './workspaceReviewSessionProgress';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import { buildSequentialReadingSourcePatch } from './workspaceSequentialReading';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

function buildSequentialReadingReviewSessionPatch(state: WorkspaceState, nodesById: WorkspaceState['nodesById'], now: string) {
  if (!state.reviewSession.currentNodeId) {
    return null;
  }
  const recommendedQueue = buildLiveReviewQueueOutput({ ...state, nodesById }, now);
  const queue = recommendedQueue.currentNodeId || state.reviewSessionMode !== 'recommended'
    ? recommendedQueue
    : buildLiveReviewQueueOutput({ ...state, nodesById }, now, { mode: 'reading-only' });
  const currentNodeId = queue.currentNodeId;
  if (!currentNodeId) {
    return null;
  }
  if (
    currentNodeId === state.reviewSession.currentNodeId &&
    queue.taskNodeIds.length === state.reviewSession.queueNodeIds.length &&
    queue.taskNodeIds.every((nodeId, index) => nodeId === state.reviewSession.queueNodeIds[index])
  ) {
    return null;
  }
  const completedCount = resolveReviewSessionProgress(state.reviewSession).reviewCompletedCount;
  return {
    activeNodeId: currentNodeId,
    reviewSession: {
      ...state.reviewSession,
      currentItemStartedAt: now,
      currentNodeId,
      isAnswerRevealed: false,
      queueNodeIds: queue.taskNodeIds,
      totalNodeCount: completedCount + queue.taskNodeIds.length
    }
  };
}

export function createSetNodeSequentialReadingAction(
  set: WorkspaceSet
): WorkspaceState['setNodeSequentialReading'] {
  return (nodeId, enabled, now = new Date().toISOString()) => {
    let nextNodesForSync: WorkspaceState['nodesById'][string][] = [];
    let updated = false;
    set((state) => {
      const patch = buildSequentialReadingSourcePatch({
        defaultPriority: getCurrentReviewSchedulerSettings().pushQueue.defaultPriority,
        enabled,
        nodeOrder: state.nodeOrder,
        nodesById: state.nodesById,
        now,
        sourceNodeId: nodeId
      });
      if (!patch) {
        return state;
      }
      const affectedNodeIds = new Set([patch.sourceNodeId, ...patch.changes.map((change) => change.nodeId)]);
      nextNodesForSync = [...affectedNodeIds]
        .map((affectedNodeId) => patch.nodesById[affectedNodeId])
        .filter((node): node is NonNullable<WorkspaceState['nodesById'][string]> => Boolean(node));
      updated = true;
      return {
        nodesById: patch.nodesById,
        ...(buildSequentialReadingReviewSessionPatch(state, patch.nodesById, now) ?? {})
      };
    });
    nextNodesForSync.forEach((node) => syncNodeContentToRuntime(node));
    return updated;
  };
}
