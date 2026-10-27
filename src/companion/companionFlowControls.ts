import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { getCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { openCompanionDailyFlowForDisplay as openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlowDisplay';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';
import { hasFlowDayChanged } from '../store/workspaceFlowDay';
import { advanceFlowSession, resumeFlowSession, type FlowAction } from '../store/workspaceFlowSession';
import { cloneWorkspaceReviewSession } from '../store/workspaceHistoryContext';

import type { CompanionFlowHistoryContext } from './companionFlowHistoryEntry';
import type { FlowOwner } from './useCompanionFlowSession';

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
    nodeId: current.session.currentNodeId, epoch: current.epoch, session: cloneWorkspaceReviewSession(current.session) }; }
  function historyContext(token: ReturnType<typeof capture>): CompanionFlowHistoryContext | undefined {
    return isAvailableNativeCompanionRuntime() ? { key: historyKey, mode, session: token.session } : undefined;
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
  function advance(token: ReturnType<typeof capture>, action: FlowAction, snapshot: WorkspaceSnapshot, now: string, persistedSession?: FlowOwner['session']) {
    if (!matches(token)) return;
    current.session = persistedSession ?? advanceFlowSession({ action, snapshot, session: current.session, mode, now });
    current.generation += 1;
    render();
  }
  async function resume(token: ReturnType<typeof capture>, snapshot: WorkspaceSnapshot) {
    if (!matches(token)) return;
    const now = new Date().toISOString();
    const session = isAvailableNativeCompanionRuntime()
      ? (await openCompanionDailyFlow({ now, mode, refresh: true })).session
      : resumeFlowSession(snapshot, mode, null, now);
    if (!matches(token)) return;
    current.session = session;
    current.generation += 1;
    render();
  }
  async function prepareAction(token: ReturnType<typeof capture>, now: string, active: () => boolean) {
    if (!matches(token) || !active()) return null;
    if (current.refresh) {
      await current.refresh;
      if (!hasCurrentFlowTarget(current, owner, token) || !active()) return null;
      token = capture();
    }
    if (!hasFlowDayChanged(current.session, now)) return token;
    const saved = await openCompanionDailyFlow({ now, mode });
    if (!matches(token) || !active()) return null;
    current.session = { ...saved.session, isAnswerRevealed:
      saved.session.currentNodeId === token.nodeId && token.session.isAnswerRevealed };
    current.generation += 1;
    render();
    return saved.session.currentNodeId === token.nodeId ? capture() : null;
  }
  function reveal() { current.session = { ...current.session, isAnswerRevealed: true }; render(); }
  const workspaceHistoryControls = {
    captureFlowHistoryContext: () => ({ session: capture().session, mode }),
    restoreFlowHistorySession: (session: FlowOwner['session']) => restore(capture(), session)
  };
  return { capture, prepareAction, historyContext, restore, matches, advance, resume, reveal, workspaceHistoryControls };
}
