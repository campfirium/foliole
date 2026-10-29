import type { DailyFlowOpenArgs } from '../../lib/core/flow/dailyFlowContract';
import { dailyFlowOperationId } from '../../lib/core/flow/dailyFlowRetry';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { commitDailyFlowRuntime, hasDailyFlowRuntime, openDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowRuntimeRepository';
import { getDemoRuntimeNowIso } from '../shared/platform/runtime/demoRuntime';
import { logRuntimeError } from '../shared/platform/runtimeLogging';

import { hasWorkspaceBrowserCommit } from './workspaceBrowserCommit';
import { mergeDailyFlowReceiptNodes } from './workspaceDailyFlowReceipt';
import { isSameWorkspaceReviewSession } from './workspaceHistoryContext';
import { buildReviewActiveNodeContext } from './workspaceReviewBrowseRoot';
import { createReviewSessionModePreference } from './workspaceReviewSessionModePreference';
import type { WorkspaceState } from './workspaceStoreTypes';

type Set = (partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState>)) => void;

const openRequests = new WeakMap<() => WorkspaceState, object>();

export function openWorkspaceDailyFlow(set: Set, get: () => WorkspaceState,
  args: DailyFlowOpenArgs, preference?: { reviewSessionMode: ReviewSessionMode; reviewSessionModeExpiresAt: string | null }, onlyIfNewer = false): Promise<string | false> {
  const request = {};
  openRequests.set(get, request);
  const before = get();
  const source = before.reviewSession;
  return openDailyFlowRuntime(args, before.nodesById).then(({ session, nodes, learning, mode }) => {
    if (openRequests.get(get) !== request || get().libraryScope !== before.libraryScope || get().reviewSession !== source) return false;
    if (onlyIfNewer && !nodes && session.daily?.revision === source.daily?.revision && session.daily?.dayKey === source.daily?.dayKey && session.daily?.scope === source.daily?.scope) return source.currentNodeId ?? false;
    set(state => ({ nodesById: mergeDailyFlowReceiptNodes(state.nodesById, before.nodesById, nodes, learning),
      ...(session.currentNodeId && (!onlyIfNewer || session.currentNodeId !== source.currentNodeId)
        ? buildReviewActiveNodeContext(state, session.currentNodeId) : {}),
      ...(onlyIfNewer ? { appActionHistory: reconcileShelveHistory(state.appActionHistory, source, session) } : {}),
      reviewSession: { ...session, isAnswerRevealed: onlyIfNewer && session.currentNodeId === source.currentNodeId && source.isAnswerRevealed }, ...preference, ...(preference && session.daily && args.startup ? createReviewSessionModePreference(mode ?? args.mode, args.now) : {}) }));
    return session.currentNodeId ?? false;
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
    .then(({ session, nodes, learning }) => {
      if (get().reviewSession !== state.reviewSession) return false;
      set(current => ({ nodesById: mergeDailyFlowReceiptNodes(current.nodesById, state.nodesById, nodes, learning),
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
    if (hasWorkspaceBrowserCommit() && !state.browserDailyFlow?.state?.invalidated) return;
    if (!hasDailyFlowRuntime() || !state.reviewSession.daily || (state.nodesById === previous.nodesById && !previous.appActionHistory.pendingAction) ||
      state.appActionHistory.applying || state.appActionHistory.pendingAction) return;
    const token = state.reviewSession.daily;
    const prior = previous.reviewSession.daily;
    if (!prior || token.scope !== prior.scope || token.dayKey !== prior.dayKey || token.revision !== prior.revision) return;
    void openWorkspaceDailyFlow(store.setState, store.getState, { now: getDemoRuntimeNowIso(),
      preserveCurrent: !hasWorkspaceBrowserCommit(), mode: state.reviewSessionMode, seed: state.reviewSession, preferredNodeId: state.reviewSession.currentNodeId }, undefined, true);
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

// Metadata history records the reconciled service context, never a private successor guess.
function reconcileShelveHistory(history: WorkspaceState['appActionHistory'], source: WorkspaceState['reviewSession'],
  session: WorkspaceState['reviewSession']) {
  const update = (entries: typeof history.undoStack, context: 'beforeContext' | 'afterContext') => {
    const entry = entries.at(-1);
    if (entry?.type !== 'topic.shelve' || !isSameWorkspaceReviewSession(entry[context].reviewSession, source)) return entries;
    return [...entries.slice(0, -1), { ...entry, [context]: { ...entry[context], reviewSession: session } }];
  };
  const undoStack = update(history.undoStack, 'afterContext');
  const redoStack = update(history.redoStack, 'beforeContext');
  return undoStack === history.undoStack && redoStack === history.redoStack ? history : { ...history, undoStack, redoStack };
}
