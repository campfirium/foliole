import { useRef, useState } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { ReviewGrade } from '../features/review/model/reviewTypes';
import { getCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { applyCompanionFlowReceipt } from '../shared/platform/companion/runtime/companionDailyFlowDisplay';
import { commitCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { isSameFlowActionTarget } from '../store/workspaceFlowDay';

import type { FlowAction } from './companionFlowHistoryEntry';
import { createCompanionFlowHistoryEntry } from './companionFlowHistoryEntry';
import { confirmFlowMutation, isCompanionGradeDue, persistFlowMutation, type FlowMutation } from './companionFlowMutation';
import type { CompanionReadingActivity } from './companionReadingActivity';
import { useCompanionFlowHistoryReplay } from './useCompanionFlowHistoryReplay';
import type { useCompanionFlowSession } from './useCompanionFlowSession';
import { useCompanionReadAdmission } from './useCompanionReadAdmission';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';
import type { useFloatingBarVisibility } from './useFloatingBarVisibility';

type Flow = ReturnType<typeof useCompanionFlowSession>;
type Token = ReturnType<Flow['capture']>;
export type CompanionSurfaceActionArgs = {
  floatingBar: ReturnType<typeof useFloatingBarVisibility>;
  flow: Flow;
  activity: CompanionReadingActivity;
  snapshot: WorkspaceSnapshot | null;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
  active: boolean;
};

export function useCompanionSurfaceActions(args: CompanionSurfaceActionArgs) {
  const [busy, setBusy] = useState(false);
  const [readingError, setReadingError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const locked = useRef(false);
  const pending = useRef<{ token: Token; mutation: FlowMutation } | null>(null);
  const latest = useRef(args);
  latest.current = args;

  const admitRead = useCompanionReadAdmission(args, latest, setReadingError);

  async function submit(action: FlowAction, grade?: ReviewGrade) {
    if (locked.current || !args.active || historyReplay.refreshPending) return;
    let token = args.flow.capture();
    if (!pending.current && !canSubmitFlowAction(args, token, action)) return;
    args.flow.cancelDocumentPreparation();
    locked.current = true;
    setBusy(true);
    setReadingError(null);
    setReviewError(null);
    try {
      if (action === 'read' && await admitRead(token)) return;
      await args.flow.readIntents?.drain();
      if (pending.current) { await finishPending(args, pending, setReadingError); return; }
      const prepared = await prepareSurfaceAction(args, token, action, () => latest.current.active);
      if (!prepared) return;
      const { snapshot, now } = prepared;
      token = prepared.token;
      if (!token.nodeId) return;
      const history = args.flow.historyContext(token);
      if (action === 'soon') {
        await commitSoonAction(args, token, snapshot, now);
        return;
      }
      const mutation = await persistFlowMutation({ action, snapshot, nodeId: token.nodeId, now,
        ...(grade ? { grade } : {}), ...(history ? { history } : {}) });
      pending.current = { token, mutation };
      await finishPending(args, pending, setReadingError);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not complete this action.';
      (action === 'grade' ? setReviewError : setReadingError)(message);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const historyReplay = useCompanionFlowHistoryReplay(args, locked, () => pending.current !== null,
    setBusy, setReviewError);
  return {
    handleFlowHistory: historyReplay.replay,
    historyRefreshPending: historyReplay.refreshPending,
    handleGradeReview: (grade: ReviewGrade) => submit('grade', grade),
    handleReadReviewTopic: () => submit('read'),
    handlePostponeReviewTopic: () => submit('later'),
    handleDismissReviewTopic: () => submit('dismiss'),
    handleSoonReviewTopic: () => submit('soon'),
    isSubmittingGrade: busy, isSubmittingReadingAction: busy,
    readingError, reviewError, setReadingError, setReviewError
  };
}

async function prepareSurfaceAction(args: CompanionSurfaceActionArgs, token: Token,
  action: FlowAction, active: () => boolean) {
  await args.activity.flush(undefined, { position: action !== 'read' });
  if (!active() || !args.flow.matches(token)) return null;
  let snapshot = await args.workspaceSync.refreshAfterMutation();
  if (!snapshot || !active() || !args.flow.matches(token) || !token.nodeId) return null;
  const now = new Date().toISOString();
  const beforePreparation = snapshot;
  const prepared = await args.flow.prepareAction(token, now, () => active());
  if (!prepared) return null;
  if (prepared !== token) {
    snapshot = await args.workspaceSync.refreshAfterMutation();
    if (!snapshot || !active() || !args.flow.matches(prepared) ||
      !isSameFlowActionTarget(beforePreparation.nodesById[token.nodeId], snapshot.nodesById[token.nodeId])) return null;
    token = prepared;
  }
  if (!token.nodeId || (action === 'grade' && !token.session.isAnswerRevealed)) return null;
  if (action === 'grade' && !isCompanionGradeDue(snapshot, token.nodeId, now)) {
    await args.flow.resume(token);
    return null;
  }
  return { token, snapshot, now };
}

async function finishPending(args: CompanionSurfaceActionArgs,
  pending: { current: { token: Token; mutation: FlowMutation } | null },
  setReadingError: (error: string) => void) {
    const saved = pending.current;
    if (!saved) return;
    if (saved.token.scope !== getCompanionReadingScope()) { pending.current = null; return; }
    // Daily receipts already register committed changes; a preview would force a full native read.
    const preview = saved.mutation.partial || saved.mutation.session?.daily || saved.mutation.action === 'grade'
      ? undefined : saved.mutation.snapshot;
    const snapshot = await args.workspaceSync.refreshAfterMutation(preview);
    if (!snapshot) throw new Error('Could not refresh the saved action.');
    if (confirmFlowMutation(saved.mutation, snapshot)) {
      args.flow.advance(saved.token, saved.mutation.action, snapshot, saved.mutation.now, saved.mutation.session);
    }
    pending.current = null;
    if (saved.mutation.partial) setReadingError('The topic was updated, but some related changes could not be saved.');
    args.floatingBar.revealBar();
  }

async function commitSoonAction(args: CompanionSurfaceActionArgs, token: Token, snapshot: WorkspaceSnapshot, now: string) {
  const history = args.flow.historyContext(token);
  const saved = history && token.nodeId ? await commitCompanionFlowHistory({ key: history.key, mode: history.mode,
    entry: createCompanionFlowHistoryEntry({ action: 'soon', nodeId: token.nodeId, now,
      before: snapshot, after: snapshot, history }) }) : null;
  if (saved && typeof saved === 'object' && 'session' in saved) await applyCompanionFlowReceipt(saved, snapshot);
  args.flow.advance(token, 'soon', snapshot, now, saved && typeof saved === 'object' && 'session' in saved ? saved.session : undefined);
}

function canSubmitFlowAction(args: CompanionSurfaceActionArgs, token: Token, action: FlowAction) {
  return Boolean(token.nodeId && args.snapshot && args.activity.nodeId === token.nodeId && !args.activity.editing &&
    (action !== 'grade' || args.flow.isAnswerRevealed));
}
