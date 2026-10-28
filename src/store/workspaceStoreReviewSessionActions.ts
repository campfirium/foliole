import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';

import { openWorkspaceDailyFlow, continueWorkspaceDailyFlow } from './workspaceDailyFlowSessionActions';
import { createReviewSessionModePreference, resolveReviewSessionModePreference } from './workspaceReviewSessionModePreference';
import type { ReviewSessionStartOptions, ReviewSessionResumeOptions, WorkspaceState } from './workspaceStore';

type WorkspaceSet = (partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState>)) => void;

function open(set: WorkspaceSet, get: () => WorkspaceState, now: string, options: ReviewSessionResumeOptions) {
  const state = get();
  const preference = resolveReviewSessionModePreference(state.reviewSessionMode, state.reviewSessionModeExpiresAt, now);
  return openWorkspaceDailyFlow(set, get, { now, mode: preference.reviewSessionMode,
    seed: state.reviewSession, ...options, startup: true }, preference);
}

export function createStartReviewSessionAction(set: WorkspaceSet, defaultOptions: ReviewSessionStartOptions = {},
  get?: () => WorkspaceState): WorkspaceState['startReviewSession'] {
  return (now = new Date().toISOString(), options = {}) => get
    ? open(set, get, now, { ...defaultOptions, ...options }).then(Boolean) : false;
}

export function createResumeReviewSessionAction(set: WorkspaceSet, get?: () => WorkspaceState): WorkspaceState['resumeReviewSession'] {
  return (now = new Date().toISOString(), options = {}) => get ? open(set, get, now, options) : false;
}

export function createContinueReviewSessionReadingAction(set: WorkspaceSet, get?: () => WorkspaceState): WorkspaceState['continueReviewSessionReading'] {
  return (now = new Date().toISOString()) => get ? continueWorkspaceDailyFlow(set, get, now) : false;
}

export function createSetReviewSessionModeAction(set: WorkspaceSet, get?: () => WorkspaceState): WorkspaceState['setReviewSessionMode'] {
  return (mode: ReviewSessionMode, now = new Date().toISOString()) => {
    if (!get) return;
    const state = get();
    const preference = createReviewSessionModePreference(mode, now);
    if (!state.reviewSession.daily) { set(preference); return; }
    return openWorkspaceDailyFlow(set, get, { now, mode, seed: state.reviewSession, refresh: true }, preference).then(() => undefined);
  };
}
