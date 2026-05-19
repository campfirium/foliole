import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';

import { buildCachedReviewQueuePlan } from './reviewQueuePlannerCached';
import { createEmptyReviewSession } from './workspaceReviewReading';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

function buildReviewQueue(state: WorkspaceState, now: string, mode: ReviewSessionMode): string[] {
  return buildCachedReviewQueuePlan({
    mode,
    nodeOrder: state.nodeOrder,
    nodesById: state.nodesById,
    now,
    trashedNodeIds: state.trashedNodeIds
  }).queueNodeIds;
}

export function createStartReviewSessionAction(set: WorkspaceSet): WorkspaceState['startReviewSession'] {
  return (now = new Date().toISOString()) => {
    let started = false;
    set((state) => {
      const queueNodeIds = buildReviewQueue(state, now, state.reviewSessionMode);
      if (queueNodeIds.length === 0) return state;
      started = true;
      return {
        activeNodeId: queueNodeIds[0] ?? state.activeNodeId,
        reviewSession: { currentNodeId: queueNodeIds[0] ?? null, isAnswerRevealed: false, queueNodeIds, totalNodeCount: queueNodeIds.length }
      };
    });
    return started;
  };
}

export function createSetReviewSessionModeAction(set: WorkspaceSet): WorkspaceState['setReviewSessionMode'] {
  return (mode, now = new Date().toISOString()) => {
    set((state) => {
      if (state.reviewSessionMode === mode) return state;
      if (!state.reviewSession.currentNodeId) return { reviewSessionMode: mode };
      const queueNodeIds = buildReviewQueue(state, now, mode);
      const completedCount = Math.max(state.reviewSession.totalNodeCount - state.reviewSession.queueNodeIds.length, 0);
      return {
        activeNodeId: queueNodeIds[0] ?? state.activeNodeId,
        reviewSession: queueNodeIds.length
          ? { currentNodeId: queueNodeIds[0] ?? null, isAnswerRevealed: false, queueNodeIds, totalNodeCount: completedCount + queueNodeIds.length }
          : createEmptyReviewSession(),
        reviewSessionMode: mode
      };
    });
  };
}
