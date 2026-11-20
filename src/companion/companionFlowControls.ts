import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { timeFlow, type FlowTiming } from '../../lib/core/flow/flowTiming';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { companionSyncAppliedEpoch } from '../shared/platform/companion/companionWorkspaceSnapshotStore';
import { getCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { openCompanionDailyFlowForDisplay as openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlowDisplay';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';
import { hasFlowDayChanged } from '../store/workspaceFlowDay';
import { cloneWorkspaceReviewSession } from '../store/workspaceHistoryContext';

import { companionFlowOpenArgs } from './companionDiveFlowControls';
import type { FlowAction } from './companionFlowHistoryEntry';
import type { CompanionFlowHistoryContext } from './companionFlowHistoryEntry';
import { finishFlowBody } from './useCompanionFlowBodyTiming';
import type { FlowOwner } from './useCompanionFlowSession';

/** True while the displayed session already reflects this snapshot through its own last commit. */
export function isSettledFlowSnapshot(current: FlowOwner, nodes: object | undefined) {
  return Boolean(nodes && current.settled?.nodes === nodes && current.settled.syncEpoch === companionSyncAppliedEpoch());
}

function beginFlowAction(current: FlowOwner) {
  current.acting?.release();
  let resolve = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  const acting = { done: promise, release() {
    if (current.acting === acting) delete current.acting;
    resolve();
  } };
  current.acting = acting;
}

export function trackCompanionFlowRefresh(current: FlowOwner, refresh: Promise<void>) {
  current.refresh = refresh;
  void refresh.finally(() => { if (current.refresh === refresh) delete current.refresh; });
}

function hasCurrentFlowTarget(current: FlowOwner, owner: { current: FlowOwner },
  token: { scope: object; owner: FlowOwner; epoch: number; nodeId: string | null }) {
  return getCompanionReadingScope() === token.scope && owner.current === token.owner &&
    current.epoch === token.epoch && current.session.currentNodeId === token.nodeId;
}

export function createCompanionFlowControls(args: {
  current: FlowOwner; owner: { current: FlowOwner }; scope: object; mode: ReviewSessionMode;
  historyKey: string; render(): void;
}) {
  const { current, owner, scope, mode, historyKey, render } = args;
  function capture() { return { owner: current, scope, generation: current.generation,
    nodeId: current.session.currentNodeId, epoch: current.epoch, session: cloneWorkspaceReviewSession(current.session),
    syncEpoch: undefined as number | undefined }; }
  function historyContext(token: ReturnType<typeof capture>): CompanionFlowHistoryContext | undefined {
    return isAvailableNativeCompanionRuntime() ? { key: historyKey, mode: token.session.dive?.mode ?? mode, session: token.session } : undefined;
  }
  function restore(token: ReturnType<typeof capture>, restored: FlowOwner['session']) {
    if (getCompanionReadingScope() !== token.scope || owner.current !== token.owner || current.epoch !== token.epoch) return;
    current.session = cloneWorkspaceReviewSession(restored);
    current.generation += 1;
    render();
  }
  function matches(token: ReturnType<typeof capture>) {
    return getCompanionReadingScope() === token.scope && owner.current === token.owner && current.generation === token.generation &&
      current.session.currentNodeId === token.nodeId;
  }
  function advance(token: ReturnType<typeof capture>, _action: FlowAction, snapshot: WorkspaceSnapshot, _now: string, persistedSession?: FlowOwner['session'], timing?: FlowTiming) {
    if (!matches(token)) { timing?.('display', 'cancelled'); return; }
    if (!persistedSession) throw new Error('daily_flow_receipt_missing');
    // Only the sync epoch seen before the commit counts; a sync landing meanwhile still forces the next reopen.
    if (token.syncEpoch !== undefined) current.settled = { nodes: snapshot.nodesById, syncEpoch: token.syncEpoch };
    current.acting?.release();
    if (timing) recordFlowDisplay(current, token.nodeId, persistedSession.currentNodeId, timing);
    current.session = persistedSession;
    current.generation += 1;
    render();
  }
  async function resume(token: ReturnType<typeof capture>) {
    if (!matches(token)) return;
    const now = new Date().toISOString();
    const session = (await openCompanionDailyFlow({ ...companionFlowOpenArgs(token.session, mode, now), refresh: true })).session;
    if (!matches(token)) return;
    current.session = session;
    current.generation += 1;
    render();
  }
  const prepareAction = (token: ReturnType<typeof capture>, now: string, nodes: object, active: () => boolean, timing?: FlowTiming) =>
    prepareFlowAction({ current, owner, mode, capture, render, matches }, token, now, nodes, active, timing);
  function reveal() { current.session = { ...current.session, isAnswerRevealed: true }; render(); }
  const workspaceHistoryControls = {
    captureFlowHistoryContext: () => ({ session: capture().session, mode }),
    restoreFlowHistorySession: (session: FlowOwner['session']) => restore(capture(), session)
  };
  return { capture, prepareAction, releaseAction: () => current.acting?.release(), historyContext, restore, matches, advance, resume, reveal, workspaceHistoryControls };
}

type FlowTarget = {
  scope: object; owner: FlowOwner; epoch: number; nodeId: string | null; generation: number; session: FlowOwner['session'];
  syncEpoch: number | undefined;
};

async function prepareFlowAction(args: { current: FlowOwner; owner: { current: FlowOwner }; mode: ReviewSessionMode;
  capture(): FlowTarget; render(): void; matches(token: FlowTarget): boolean }, token: FlowTarget, now: string,
  nodes: object, active: () => boolean, timing?: FlowTiming): Promise<FlowTarget | null> {
  const { current, owner, mode, capture, render, matches } = args;
  if (!matches(token) || !active()) return null;
  if (current.refresh) {
    const refresh = current.refresh;
    await timeFlow(timing, 'refresh-wait', () => refresh);
    if (!hasCurrentFlowTarget(current, owner, token) || !active()) return null;
    token = capture();
  }
  const changedDay = hasFlowDayChanged(current.session, now);
  timing?.('day-check', changedDay ? 'done' : 'skipped');
  const syncEpoch = companionSyncAppliedEpoch();
  // Native reopening validates the shown card against outside writes; the session's own last commit needs none.
  if (!changedDay && (!isAvailableNativeCompanionRuntime() || isSettledFlowSnapshot(current, nodes))) {
    timing?.('open', 'skipped');
    token.syncEpoch = syncEpoch;
    beginFlowAction(current);
    return token;
  }
  const saved = await timeFlow(timing, 'open',
    () => openCompanionDailyFlow(companionFlowOpenArgs(token.session, mode, now), timing));
  if (!matches(token) || !active()) return null;
  current.session = { ...saved.session, isAnswerRevealed:
    saved.session.currentNodeId === token.nodeId && token.session.isAnswerRevealed };
  current.generation += 1;
  render();
  if (saved.session.currentNodeId !== token.nodeId) return null;
  beginFlowAction(current);
  return { ...capture(), syncEpoch };
}

function recordFlowDisplay(current: FlowOwner, sourceId: string | null, nodeId: string | null, timing: FlowTiming) {
  finishFlowBody(current.displayTiming, 'cancelled');
  delete current.displayTiming;
  timing('display', !nodeId ? 'empty' : nodeId === sourceId ? 'skipped' : 'done');
  if (nodeId && nodeId !== sourceId) {
    current.displayTiming = { timing, nodeId, generation: current.generation + 1 };
    timing('body', 'start');
    timing('editor-ready', 'start');
  } else {
    timing('body', 'skipped');
    timing('editor-ready', 'skipped');
  }
}
