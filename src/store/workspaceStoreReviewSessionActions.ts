import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { buildCachedReviewQueuePlan } from './reviewQueuePlannerCached';
import {
  advanceReviewSession,
  createEmptyReviewSession,
  createStartedReviewSession
} from './workspaceReviewReading';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

function buildReviewQueue(state: WorkspaceState, now: string, mode: ReviewSessionMode): string[] {
  return buildCachedReviewQueuePlan({
    mode,
    nodeOrder: state.nodeOrder,
    nodesById: state.nodesById,
    now,
    pushQueueRules: getCurrentReviewSchedulerSettings().pushQueue,
    trashedNodeIds: state.trashedNodeIds
  }).queueNodeIds;
}

function buildDisplayedReviewQueue(state: WorkspaceState, now: string): string[] {
  return buildCachedReviewQueuePlan({
    includeScheduled: true,
    nodeOrder: state.nodeOrder,
    nodesById: state.nodesById,
    now,
    pushQueueRules: getCurrentReviewSchedulerSettings().pushQueue,
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
        reviewSession: createStartedReviewSession({
          continueNodeId: state.activeNodeId,
          currentNodeId: queueNodeIds[0] ?? null,
          queueNodeIds,
          sessionStartedAt: now,
          totalNodeCount: queueNodeIds.length
        })
      };
    });
    return started;
  };
}

export function createResumeReviewSessionAction(set: WorkspaceSet): WorkspaceState['resumeReviewSession'] {
  return (now = new Date().toISOString()) => {
    let resumed = false;
    set((state) => {
      const queueNodeIds = buildDisplayedReviewQueue(state, now);
      const currentNodeId = queueNodeIds[0] ?? null;
      if (!currentNodeId) return state;
      resumed = true;
      return {
        activeNodeId: currentNodeId,
        reviewSession: createStartedReviewSession({
          continueNodeId: state.reviewSession.continueNodeId ?? state.activeNodeId,
          currentNodeId,
          queueNodeIds,
          sessionStartedAt: state.reviewSession.sessionStartedAt ?? now,
          totalNodeCount: queueNodeIds.length
        })
      };
    });
    return resumed;
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
          ? advanceReviewSession(state.reviewSession, {
              nextNodeId: queueNodeIds[0]!,
              queueNodeIds,
              totalNodeCount: completedCount + queueNodeIds.length
            })
          : createEmptyReviewSession(),
        reviewSessionMode: mode
      };
    });
  };
}
