import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';

import { buildReviewActiveNodeContext } from './workspaceReviewBrowseRoot';
import {
  buildLiveReviewQueue,
  buildReviewSessionReadingContinuationQueue,
  buildStartReviewSessionQueue
} from './workspaceReviewLiveQueue';
import {
  advanceReviewSession,
  createEmptyReviewSession,
  createStartedReviewSession
} from './workspaceReviewReading';
import { buildResumeReviewSessionQueue } from './workspaceReviewResumeQueue';
import { resolveReviewSessionProgress } from './workspaceReviewSessionProgress';
import type { ReviewSessionStartOptions, WorkspaceState } from './workspaceStore';
import { persistNodeOpened } from './workspaceStoreNodeOpenState';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

function buildReviewQueue(state: WorkspaceState, now: string, mode: ReviewSessionMode): string[] {
  return buildLiveReviewQueue(state, now, { mode });
}

export function createStartReviewSessionAction(
  set: WorkspaceSet,
  defaultOptions: ReviewSessionStartOptions = {}
): WorkspaceState['startReviewSession'] {
  return (now = new Date().toISOString(), options = {}) => {
    let started = false;
    let openedNodeId: string | null = null;
    const startOptions = { ...defaultOptions, ...options };
    set((state) => {
      const queueNodeIds = buildStartReviewSessionQueue(state, now, startOptions);
      if (queueNodeIds.length === 0) return state;
      started = true;
      openedNodeId = queueNodeIds[0]!;
      return {
        ...buildReviewActiveNodeContext(state, queueNodeIds[0] ?? null),
        reviewSession: createStartedReviewSession({
          continueNodeId: state.activeNodeId,
          currentNodeId: queueNodeIds[0] ?? null,
          queueNodeIds,
          sessionStartedAt: now,
          totalNodeCount: queueNodeIds.length
        })
      };
    });
    if (openedNodeId) void persistNodeOpened(set, openedNodeId, now);
    return started;
  };
}

export function createContinueReviewSessionReadingAction(set: WorkspaceSet): WorkspaceState['continueReviewSessionReading'] {
  return (now = new Date().toISOString()) => {
    let continued = false;
    let openedNodeId: string | null = null;
    set((state) => {
      const continueNodeId = state.reviewSession.continueNodeId;
      const continueNode = continueNodeId ? state.nodesById[continueNodeId] : undefined;
      if (!continueNodeId || !continueNode || state.trashedNodeIds.includes(continueNodeId)) return state;
      if (!isReadingReviewItemNode(continueNode)) return state;
      const queueNodeIds = buildReviewSessionReadingContinuationQueue(state, now, continueNodeId);
      if (!queueNodeIds.includes(continueNodeId)) return state;
      continued = true;
      openedNodeId = continueNodeId;
      return {
        ...buildReviewActiveNodeContext(state, continueNodeId),
        reviewSession: advanceReviewSession(state.reviewSession, {
          nextNodeId: continueNodeId,
          queueNodeIds,
          totalNodeCount: resolveReviewSessionProgress(state.reviewSession).reviewCompletedCount + queueNodeIds.length
        })
      };
    });
    if (openedNodeId) void persistNodeOpened(set, openedNodeId, now);
    return continued;
  };
}

export function createResumeReviewSessionAction(set: WorkspaceSet): WorkspaceState['resumeReviewSession'] {
  return (now = new Date().toISOString(), options = {}) => {
    let resumed = false;
    let openedNodeId: string | null = null;
    set((state) => {
      const queueNodeIds = buildResumeReviewSessionQueue(state, now, options);
      const currentNodeId = queueNodeIds[0] ?? null;
      if (!currentNodeId) return state;
      resumed = true;
      openedNodeId = currentNodeId;
      return {
        ...buildReviewActiveNodeContext(state, currentNodeId),
        reviewSession: createStartedReviewSession({
          continueNodeId: state.reviewSession.continueNodeId ?? state.activeNodeId,
          currentNodeId,
          queueNodeIds,
          sessionStartedAt: state.reviewSession.sessionStartedAt ?? now,
          totalNodeCount: queueNodeIds.length
        })
      };
    });
    if (openedNodeId) void persistNodeOpened(set, openedNodeId, now);
    return resumed;
  };
}

export function createSetReviewSessionModeAction(set: WorkspaceSet): WorkspaceState['setReviewSessionMode'] {
  return (mode, now = new Date().toISOString()) => {
    let openedNodeId: string | null = null;
    set((state) => {
      const isSameMode = state.reviewSessionMode === mode;
      if (!state.reviewSession.currentNodeId) {
        return isSameMode ? state : { reviewSessionMode: mode };
      }
      const queueNodeIds = buildReviewQueue(state, now, mode);
      const completedCount = resolveReviewSessionProgress(state.reviewSession).reviewCompletedCount;
      openedNodeId = queueNodeIds[0] ?? null;
      return {
        ...buildReviewActiveNodeContext(state, queueNodeIds[0] ?? null),
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
    if (openedNodeId) void persistNodeOpened(set, openedNodeId, now);
  };
}
