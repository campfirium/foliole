import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { getCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';
import { advanceFlowSession, resumeFlowSession, type FlowAction } from '../store/workspaceFlowSession';
import { cloneWorkspaceReviewSession } from '../store/workspaceHistoryContext';

import type { CompanionFlowHistoryContext } from './companionFlowHistoryEntry';
import type { FlowOwner } from './useCompanionFlowSession';

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
  function advance(token: ReturnType<typeof capture>, action: FlowAction, snapshot: WorkspaceSnapshot, now: string) {
    if (!matches(token)) return;
    current.session = advanceFlowSession({ action, snapshot, session: current.session, mode, now });
    current.generation += 1;
    render();
  }
  function resume(token: ReturnType<typeof capture>, snapshot: WorkspaceSnapshot) {
    if (!matches(token)) return;
    current.session = resumeFlowSession(snapshot, mode, null, new Date().toISOString());
    current.generation += 1;
    render();
  }
  function reveal() { current.session = { ...current.session, isAnswerRevealed: true }; render(); }
  const workspaceHistoryControls = {
    captureFlowHistoryContext: () => ({ session: capture().session, mode }),
    restoreFlowHistorySession: (session: FlowOwner['session']) => restore(capture(), session)
  };
  return { capture, historyContext, restore, matches, advance, resume, reveal, workspaceHistoryControls };
}
