import { useRef, useState } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { ReviewGrade } from '../features/review/model/reviewTypes';
import { getCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import type { FlowAction } from '../store/workspaceFlowSession';

import { confirmFlowMutation, isCompanionGradeDue, persistFlowMutation, type FlowMutation } from './companionFlowMutation';
import type { CompanionReadingActivity } from './companionReadingActivity';
import type { useCompanionFlowSession } from './useCompanionFlowSession';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';
import type { useFloatingBarVisibility } from './useFloatingBarVisibility';

type Flow = ReturnType<typeof useCompanionFlowSession>;
type Token = ReturnType<Flow['capture']>;
type Args = {
  floatingBar: ReturnType<typeof useFloatingBarVisibility>;
  flow: Flow;
  activity: CompanionReadingActivity;
  snapshot: WorkspaceSnapshot | null;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
  active: boolean;
};

export function useCompanionSurfaceActions(args: Args) {
  const [busy, setBusy] = useState(false);
  const [readingError, setReadingError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const locked = useRef(false);
  const pending = useRef<{ token: Token; mutation: FlowMutation } | null>(null);
  const latest = useRef(args);
  latest.current = args;

  async function submit(action: FlowAction, grade?: ReviewGrade) {
    if (locked.current || !args.active) return;
    const token = args.flow.capture();
    if (!pending.current && (!token.nodeId || !args.snapshot)) return;
    if (!pending.current && (args.activity.nodeId !== token.nodeId || args.activity.editing)) return;
    if (!pending.current && action === 'grade' && !args.flow.isAnswerRevealed) return;
    locked.current = true;
    setBusy(true);
    setReadingError(null);
    setReviewError(null);
    try {
      if (pending.current) { await finishPending(args, pending, setReadingError); return; }
      await args.activity.flush();
      if (!latest.current.active || !args.flow.matches(token)) return;
      const snapshot = await args.workspaceSync.refreshAfterMutation();
      if (!snapshot || !latest.current.active || !args.flow.matches(token) || !token.nodeId) return;
      if (action === 'grade' && !latest.current.flow.isAnswerRevealed) return;
      const now = new Date().toISOString();
      if (action === 'grade' && !isCompanionGradeDue(snapshot, token.nodeId, now)) {
        args.flow.resume(token, snapshot);
        return;
      }
      if (action === 'soon') { args.flow.advance(token, action, snapshot, now); return; }
      const mutation = await persistFlowMutation({ action, snapshot, nodeId: token.nodeId, now,
        ...(grade ? { grade } : {}) });
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
  return {
    handleGradeReview: (grade: ReviewGrade) => submit('grade', grade),
    handleReadReviewTopic: () => submit('read'),
    handlePostponeReviewTopic: () => submit('later'),
    handleDismissReviewTopic: () => submit('dismiss'),
    handleSoonReviewTopic: () => submit('soon'),
    isSubmittingGrade: busy, isSubmittingReadingAction: busy,
    readingError, reviewError, setReadingError, setReviewError
  };
}

async function finishPending(args: Args,
  pending: { current: { token: Token; mutation: FlowMutation } | null },
  setReadingError: (error: string) => void) {
    const saved = pending.current;
    if (!saved) return;
    if (saved.token.scope !== getCompanionReadingScope()) { pending.current = null; return; }
    const snapshot = await args.workspaceSync.refreshAfterMutation(saved.mutation.partial ? undefined : saved.mutation.snapshot);
    if (!snapshot) throw new Error('Could not refresh the saved action.');
    if (confirmFlowMutation(saved.mutation, snapshot)) {
      args.flow.advance(saved.token, saved.mutation.action, snapshot, saved.mutation.now);
    }
    pending.current = null;
    if (saved.mutation.partial) setReadingError('The topic was updated, but some related changes could not be saved.');
    args.floatingBar.revealBar();
  }
