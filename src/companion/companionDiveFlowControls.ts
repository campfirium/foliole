import type { DailyFlowOpenArgs } from '../../lib/core/flow/dailyFlowContract';
import type { DailyFlowSession, DiveFlowScope } from '../../lib/core/flow/dailyFlowSession';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { openCompanionDailyFlowForDisplay } from '../shared/platform/companion/runtime/companionDailyFlowDisplay';
import { getCompanionReadIntents } from '../shared/platform/companion/runtime/companionReadIntents';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import type { CompanionReadingActivity } from './companionReadingActivity';
import type { FlowOwner } from './useCompanionFlowSession';

export function companionFlowOpenArgs(session: DailyFlowSession, mode: ReviewSessionMode, now: string): DailyFlowOpenArgs {
  const dive = session.dive;
  return dive ? { now, mode: dive.mode, dive: { id: dive.id, topicIds: dive.topicIds }, seed: session } : { now, mode };
}

export function createCompanionDiveFlowControls(current: FlowOwner, owner: { current: FlowOwner },
  mode: ReviewSessionMode, render: () => void) {
  return async (scope: DiveFlowScope | null, step?: DailyFlowOpenArgs['diveStep'], selectedMode?: ReviewSessionMode) => {
    if (!isAvailableNativeCompanionRuntime() || current.diveOpening) return false;
    current.diveOpening = true;
    const source = current.session;
    const generation = current.generation;
    try {
      current.readIntents ??= await getCompanionReadIntents();
      await current.readIntents.drain();
      const now = new Date().toISOString();
      const args: DailyFlowOpenArgs = scope ? { now, mode: selectedMode ?? source.dive?.mode ?? mode, dive: scope,
        ...(step ? { seed: source, diveStep: step } : {}) } : { now, mode, returnFromDive: true };
      const saved = await openCompanionDailyFlowForDisplay(args);
      if (owner.current !== current || generation !== current.generation) return false;
      current.session = saved.session;
      current.hydrated = true;
      current.error = null;
      current.generation += 1;
      current.epoch += 1;
      return true;
    } catch (error) {
      if (owner.current === current) current.error = String(error);
      return false;
    } finally {
      delete current.diveOpening;
      if (owner.current === current) render();
    }
  };
}

export function createCompanionDiveEntry(open: ReturnType<typeof createCompanionDiveFlowControls>,
  activity: CompanionReadingActivity, actions: { isSubmittingReadingAction: boolean; handleTabAction(action: 'review'): void }) {
  return async (...options: Parameters<typeof open>) => {
    if (actions.isSubmittingReadingAction || activity.editing) return;
    await activity.flush();
    if (await open(...options)) actions.handleTabAction('review');
  };
}

export function companionDiveModeControls(open: ReturnType<typeof createCompanionDiveFlowControls>,
  dive: DailyFlowSession['dive'], mode: ReviewSessionMode, setMode: (mode: ReviewSessionMode) => void) {
  return { mode: dive?.mode ?? mode, setMode: (next: ReviewSessionMode) => {
    if (!dive) setMode(next);
    else if (dive.mode !== next) void open({ id: dive.id, topicIds: dive.topicIds }, undefined, next);
  } };
}
