import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';

import { buildCurrentReviewSessionQueue, buildLiveReviewQueue, buildLiveReviewQueueOutput } from './workspaceReviewLiveQueue';
import {
  advanceReviewSession,
  createEmptyReviewSession,
  createStartedReviewSession
} from './workspaceReviewReading';
import { resolveReviewSessionProgress } from './workspaceReviewSessionProgress';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

function buildReviewQueue(state: WorkspaceState, now: string, mode: ReviewSessionMode): string[] {
  return buildLiveReviewQueue(state, now, { mode });
}

function buildReadingPushQueue(state: WorkspaceState, now: string) {
  return buildLiveReviewQueue(state, now, { mode: 'reading-only' });
}

function buildCurrentSessionQueue(state: WorkspaceState, now: string, mode = state.reviewSessionMode) {
  return mode === state.reviewSessionMode
    ? buildCurrentReviewSessionQueue(state, now)
    : buildLiveReviewQueue(state, now, { mode });
}

function resolveResumeCurrentNodeId(state: WorkspaceState, queueNodeIds: string[]) {
  const currentNodeId = state.reviewSession.currentNodeId;
  if (currentNodeId && queueNodeIds.includes(currentNodeId)) {
    return currentNodeId;
  }
  return queueNodeIds[0] ?? null;
}

export function createStartReviewSessionAction(set: WorkspaceSet): WorkspaceState['startReviewSession'] {
  return (now = new Date().toISOString()) => {
    let started = false;
    set((state) => {
      const liveQueue = buildLiveReviewQueueOutput(state, now, { mode: state.reviewSessionMode });
      const queueNodeIds = liveQueue.taskNodeIds;
      const isTaskQueue = queueNodeIds.length > 0;
      const fallbackQueueNodeIds = isTaskQueue ? queueNodeIds : buildReadingPushQueue(state, now);
      if (fallbackQueueNodeIds.length === 0) return state;
      started = true;
      return {
        activeNodeId: fallbackQueueNodeIds[0] ?? state.activeNodeId,
        reviewSession: createStartedReviewSession({
          continueNodeId: state.activeNodeId,
          currentNodeId: fallbackQueueNodeIds[0] ?? null,
          queueNodeIds: fallbackQueueNodeIds,
          sessionStartedAt: now,
          totalNodeCount: fallbackQueueNodeIds.length
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
      const queueNodeIds = buildCurrentSessionQueue(state, now);
      const currentNodeId = resolveResumeCurrentNodeId(state, queueNodeIds);
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
      const isSameMode = state.reviewSessionMode === mode;
      if (!state.reviewSession.currentNodeId) {
        return isSameMode ? state : { reviewSessionMode: mode };
      }
      const queueNodeIds = buildReviewQueue(state, now, mode);
      const completedCount = resolveReviewSessionProgress(state.reviewSession).reviewCompletedCount;
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
