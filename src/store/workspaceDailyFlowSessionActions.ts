import type { DailyFlowOpenArgs } from '../../lib/core/flow/dailyFlowContract';
import { dailyFlowOperationId } from '../../lib/core/flow/dailyFlowRetry';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { commitDailyFlowRuntime, hasDailyFlowRuntime, openDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowRuntimeRepository';
import { logRuntimeError } from '../shared/platform/runtimeLogging';

import { mergeDailyFlowReceiptNodes } from './workspaceDailyFlowReceipt';
import { buildReviewActiveNodeContext } from './workspaceReviewBrowseRoot';
import type { WorkspaceState } from './workspaceStoreTypes';

type Set = (partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState>)) => void;

export function openWorkspaceDailyFlow(set: Set, get: () => WorkspaceState,
  args: DailyFlowOpenArgs, preference?: { reviewSessionMode: ReviewSessionMode; reviewSessionModeExpiresAt: string | null }, onlyIfNewer = false) {
  const before = get();
  const source = before.reviewSession;
  return openDailyFlowRuntime(args).then(({ session, nodes }) => {
    if (get().reviewSession !== source) return false;
    if (onlyIfNewer && session.daily?.revision === source.daily?.revision && session.daily?.dayKey === source.daily?.dayKey && session.daily?.scope === source.daily?.scope) return Boolean(source.currentNodeId);
    set(state => ({ nodesById: mergeDailyFlowReceiptNodes(state.nodesById, before.nodesById, nodes), ...(session.currentNodeId ? buildReviewActiveNodeContext(state, session.currentNodeId) : {}),
      reviewSession: { ...session, isAnswerRevealed: onlyIfNewer && session.currentNodeId === source.currentNodeId && source.isAnswerRevealed }, ...preference }));
    return Boolean(session.currentNodeId);
  }).catch(error => {
    logRuntimeError('could not open daily Flow', { area: 'persistence', action: 'open_daily_flow',
      fallback: 'keep_previous_session', error });
    return false;
  });
}

export function continueWorkspaceDailyFlow(set: Set, get: () => WorkspaceState, now: string) {
  const state = get();
  const source = state.reviewSession;
  if (source.currentNodeId || !source.continueNodeId || !source.daily) return Promise.resolve(false);
  return commitDailyFlowRuntime({ opId: dailyFlowOperationId(source.daily, source.continueNodeId, 'continue-reading'),
    now, token: source.daily, navigation: 'continue-reading', expectedContinueNodeId: source.continueNodeId }, state.nodesById)
    .then(({ session, nodes }) => {
      if (get().reviewSession !== state.reviewSession) return false;
      set(current => ({ nodesById: mergeDailyFlowReceiptNodes(current.nodesById, state.nodesById, nodes),
        ...(session.currentNodeId ? buildReviewActiveNodeContext(current, session.currentNodeId) : {}), reviewSession: session }));
      return Boolean(session.currentNodeId);
    }).catch(async error => {
      if (get().reviewSession === source) await recoverWorkspaceDailyFlow(set, get, error, now);
      return false;
    });
}

export function installDailyFlowExternalRefresh(store: { getState(): WorkspaceState;
  setState: Set; subscribe(handler: (state: WorkspaceState, previous: WorkspaceState) => void): () => void }) {
  store.subscribe((state, previous) => {
    if (!hasDailyFlowRuntime() || !state.reviewSession.daily || state.nodesById === previous.nodesById ||
      state.appActionHistory.applying || state.appActionHistory.pendingAction) return;
    const token = state.reviewSession.daily;
    const prior = previous.reviewSession.daily;
    if (!prior || token.scope !== prior.scope || token.dayKey !== prior.dayKey || token.revision !== prior.revision) return;
    void openWorkspaceDailyFlow(store.setState, store.getState, { now: new Date().toISOString(),
      mode: state.reviewSessionMode, seed: state.reviewSession }, undefined, true);
  });
}

export async function recoverWorkspaceDailyFlow(set: Set, get: () => WorkspaceState, error: unknown, now: string) {
  const message = error instanceof Error ? error.message : String(error);
  if (!/daily_flow_(changed|learning_changed|ack_superseded)/.test(message)) return;
  const source = get().reviewSession;
  if (!source.daily) return;
  await openWorkspaceDailyFlow(set, get, { now, mode: get().reviewSessionMode,
    preferredNodeId: source.currentNodeId, seed: source, refresh: true }, undefined, true);
}
