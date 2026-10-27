import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { hasDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowRuntimeRepository';

import { openWorkspaceDailyFlow, continueWorkspaceDailyFlow } from './workspaceDailyFlowSessionActions';
import { buildReviewActiveNodeContext } from './workspaceReviewBrowseRoot';
import { buildStartReviewSessionQueue } from './workspaceReviewLiveQueue';
import {
  advanceReviewSession,
  createEmptyReviewSession,
  createStartedReviewSession
} from './workspaceReviewReading';
import { continueReviewSessionReading } from './workspaceReviewReadingContinuation';
import { buildResumeReviewSessionQueue } from './workspaceReviewResumeQueue';
import {
  createReviewSessionModePreference,
  resolveReviewSessionModePreference
} from './workspaceReviewSessionModePreference';
import { resolveReviewSessionProgress } from './workspaceReviewSessionProgress';
import type { ReviewSessionStartOptions, WorkspaceState } from './workspaceStore';
import { persistNodeOpened } from './workspaceStoreNodeOpenState';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

function buildReviewQueue(state: WorkspaceState, now: string, mode: ReviewSessionMode): string[] {
  return buildStartReviewSessionQueue({ ...state, reviewSessionMode: mode }, now);
}

function buildStartQueue(state: WorkspaceState, now: string, options: ReviewSessionStartOptions) {
  const preference = resolveReviewSessionModePreference(
    state.reviewSessionMode,
    state.reviewSessionModeExpiresAt,
    now
  );
  const modeState = { ...state, ...preference };
  const queueNodeIds = buildStartReviewSessionQueue(modeState, now, options);
  if (queueNodeIds.length > 0 || preference.reviewSessionMode === 'recommended') {
    return { preference, queueNodeIds };
  }
  const fallbackPreference = createReviewSessionModePreference('recommended', now);
  return {
    preference: fallbackPreference,
    queueNodeIds: buildStartReviewSessionQueue({ ...state, ...fallbackPreference }, now, options)
  };
}

export function createStartReviewSessionAction(
  set: WorkspaceSet,
  defaultOptions: ReviewSessionStartOptions = {},
  get?: () => WorkspaceState
): WorkspaceState['startReviewSession'] {
  return (now = new Date().toISOString(), options = {}) => {
    if (get && hasDailyFlowRuntime()) {
      const state = get();
      const preference = resolveReviewSessionModePreference(state.reviewSessionMode, state.reviewSessionModeExpiresAt, now);
      return openWorkspaceDailyFlow(set, get, { now, mode: preference.reviewSessionMode,
        seed: state.reviewSession, ...defaultOptions, ...options, startup: true }, preference).then(Boolean);
    }
    let started = false;
    let openedNodeId: string | null = null;
    const startOptions = { ...defaultOptions, ...options };
    set((state) => {
      const { preference, queueNodeIds } = buildStartQueue(state, now, startOptions);
      if (queueNodeIds.length === 0) return preference;
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
        }),
        ...preference
      };
    });
    if (openedNodeId) void persistNodeOpened(set, openedNodeId, now);
    return started;
  };
}

export function createContinueReviewSessionReadingAction(set: WorkspaceSet, get?: () => WorkspaceState): WorkspaceState['continueReviewSessionReading'] {
  return (now = new Date().toISOString()) => {
    if (get?.().reviewSession.daily && hasDailyFlowRuntime()) return continueWorkspaceDailyFlow(set, get, now);
    let continued = false;
    let openedNodeId: string | null = null;
    set((state) => {
      const reviewSession = continueReviewSessionReading(state, now);
      if (!reviewSession?.currentNodeId) return state;
      const continueNodeId = reviewSession.currentNodeId;
      continued = true;
      openedNodeId = continueNodeId;
      return {
        ...buildReviewActiveNodeContext(state, continueNodeId),
        reviewSession
      };
    });
    if (openedNodeId) void persistNodeOpened(set, openedNodeId, now);
    return continued;
  };
}

export function createResumeReviewSessionAction(set: WorkspaceSet, get?: () => WorkspaceState): WorkspaceState['resumeReviewSession'] {
  return (now = new Date().toISOString(), options = {}) => {
    if (get && hasDailyFlowRuntime()) {
      const state = get();
      const preference = resolveReviewSessionModePreference(state.reviewSessionMode, state.reviewSessionModeExpiresAt, now);
      return openWorkspaceDailyFlow(set, get, { now, mode: preference.reviewSessionMode,
        seed: state.reviewSession, ...options, startup: true }, preference);
    }
    let openedNodeId: string | null = null;
    set((state) => {
      const preference = resolveReviewSessionModePreference(
        state.reviewSessionMode,
        state.reviewSessionModeExpiresAt,
        now
      );
      const queueNodeIds = buildResumeReviewSessionQueue({ ...state, ...preference }, now, options);
      const currentNodeId = queueNodeIds[0] ?? null;
      if (!currentNodeId) return preference;
      openedNodeId = currentNodeId;
      return {
        ...buildReviewActiveNodeContext(state, currentNodeId),
        reviewSession: createStartedReviewSession({
          continueNodeId: state.reviewSession.continueNodeId ?? state.activeNodeId,
          currentNodeId,
          queueNodeIds,
          sessionStartedAt: state.reviewSession.sessionStartedAt ?? now,
          totalNodeCount: queueNodeIds.length
        }),
        ...preference
      };
    });
    if (openedNodeId) void persistNodeOpened(set, openedNodeId, now);
    return openedNodeId ?? false;
  };
}

export function createSetReviewSessionModeAction(set: WorkspaceSet, get?: () => WorkspaceState): WorkspaceState['setReviewSessionMode'] {
  return (mode, now = new Date().toISOString()) => {
    if (get?.().reviewSession.daily && hasDailyFlowRuntime()) {
      void openWorkspaceDailyFlow(set, get, { now, mode, seed: get().reviewSession, refresh: true }, createReviewSessionModePreference(mode, now));
      return;
    }
    let openedNodeId: string | null = null;
    set((state) => {
      const preference = createReviewSessionModePreference(mode, now);
      const isSameMode = state.reviewSessionMode === mode;
      if (!state.reviewSession.currentNodeId) {
        return isSameMode && state.reviewSessionModeExpiresAt === preference.reviewSessionModeExpiresAt
          ? state
          : preference;
      }
      const queueNodeIds = buildReviewQueue(state, now, mode);
      if (queueNodeIds.length === 0) return state;
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
        ...preference
      };
    });
    if (openedNodeId) void persistNodeOpened(set, openedNodeId, now);
  };
}
