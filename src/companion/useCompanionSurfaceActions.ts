import { useRef, useState } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { isDailyFlowNoOtherTopics } from '../../lib/core/flow/dailyFlowSoonOutcome';
import { timeFlow, type FlowTiming, type FlowTimingStatus } from '../../lib/core/flow/flowTiming';
import { findEnabledSequentialReadingSourceId } from '../../lib/core/review/sequentialReadingSources';
import type { ReviewGrade } from '../features/review/model/reviewTypes';
import { getStoredAppLocale } from '../shared/localization/appLanguage';
import { translate } from '../shared/localization/translations';
import { getCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { applyCompanionFlowReceipt } from '../shared/platform/companion/runtime/companionDailyFlowDisplay';
import { commitCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { beginAndroidFlowAction } from '../shared/platform/supportLog/androidFlowTiming';
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
type Pending = { token: Token; mutation: FlowMutation; timing?: FlowTiming | undefined };
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
  const pending = useRef<Pending | null>(null);
  const latest = useRef(args);
  latest.current = args;

  const admitRead = useCompanionReadAdmission(args, latest, setReadingError);

  async function submit(action: FlowAction, grade?: ReviewGrade, atContentEnd = false, nextTopicId?: string) {
    const timing = beginAndroidFlowAction(action);
    if (locked.current || !args.active || historyReplay.refreshPending) {
      timing?.('action', 'skipped');
      return;
    }
    const token = args.flow.capture();
    if (!pending.current && !canSubmitFlowAction(args, token, action)) {
      timing?.('action', 'cancelled');
      return;
    }
    let status: FlowTimingStatus = 'failed';
    if (action !== 'read') args.flow.cancelDocumentPreparation();
    locked.current = true;
    setBusy(true);
    setReadingError(null);
    setReviewError(null);
    try {
      const releaseSequentialReading = action === 'read' && atContentEnd && Boolean(token.nodeId && args.snapshot &&
        findEnabledSequentialReadingSourceId(token.nodeId, args.snapshot.nodesById));
      const admitted = action === 'read' && !pending.current
        ? await admitRead(token, releaseSequentialReading, nextTopicId, timing) : false;
      status = admitted || (action === 'read' && !pending.current && nextTopicId ? 'cancelled'
        : await submitPreparedAction(args, { token, action, grade, releaseSequentialReading }, pending,
          () => latest.current.active, setReadingError, timing));
    } catch (error) {
      status = presentFlowActionError(error, action, setReadingError, setReviewError);
    } finally {
      timing?.('action', status);
      args.flow.releaseAction();
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
    handleReadReviewTopic: (atContentEnd = false, nextTopicId?: string) => submit('read', undefined, atContentEnd, nextTopicId),
    handlePostponeReviewTopic: () => submit('later'),
    handleDismissReviewTopic: () => submit('dismiss'),
    handleSoonReviewTopic: () => submit('soon'),
    isSubmittingGrade: busy, isSubmittingReadingAction: busy,
    readingError, reviewError, setReadingError, setReviewError
  };
}

function presentFlowActionError(error: unknown, action: FlowAction, setReadingError: (message: string) => void,
  setReviewError: (message: string) => void): FlowTimingStatus {
  if (isDailyFlowNoOtherTopics(error)) {
    setReadingError(translate(getStoredAppLocale(), 'shared.flow.soonNoOtherTopics'));
    return 'cancelled';
  }
  const message = error instanceof Error ? error.message : 'Could not complete this action.';
  (action === 'grade' ? setReviewError : setReadingError)(message);
  return 'failed';
}

async function submitPreparedAction(args: CompanionSurfaceActionArgs,
  input: { token: Token; action: FlowAction; grade: ReviewGrade | undefined; releaseSequentialReading: boolean },
  pending: { current: Pending | null }, active: () => boolean, setReadingError: (error: string) => void,
  timing?: FlowTiming): Promise<FlowTimingStatus> {
  const { action, grade, releaseSequentialReading } = input;
  const readIntents = args.flow.readIntents;
  if (readIntents?.pending || readIntents?.error) await timeFlow(timing, 'read-drain', () => readIntents.drain());
  else await readIntents?.drain();
  if (pending.current) { await finishPending(args, pending, setReadingError); return 'skipped'; }
  const prepared = await prepareSurfaceAction(args, input.token, action, active, timing);
  if (!prepared?.token.nodeId) return 'cancelled';
  const { token, snapshot, now } = prepared;
  if (action === 'soon') {
    await commitSoonAction(args, token, snapshot, now, timing);
  } else {
    const history = args.flow.historyContext(token);
    const mutation = await persistFlowMutation({ action, snapshot, nodeId: prepared.token.nodeId, now, releaseSequentialReading,
      ...(grade ? { grade } : {}), ...(history ? { history } : {}) }, timing);
    pending.current = { token, mutation, timing };
    await finishPending(args, pending, setReadingError);
  }
  return 'done';
}

async function prepareSurfaceAction(args: CompanionSurfaceActionArgs, token: Token,
  action: FlowAction, active: () => boolean, timing?: FlowTiming) {
  await timeFlow(timing, 'flush', () => args.activity.flush(undefined, { position: action !== 'read' }));
  if (!active() || !args.flow.matches(token)) return null;
  let snapshot = await timeFlow(timing, 'refresh', () => args.workspaceSync.refreshAfterMutation());
  if (!snapshot || !active() || !args.flow.matches(token) || !token.nodeId) return null;
  const now = new Date().toISOString();
  const beforePreparation = snapshot;
  const prepared = await args.flow.prepareAction(token, now, snapshot.nodesById, () => active(), timing);
  if (!prepared) return null;
  if (prepared !== token) {
    snapshot = await timeFlow(timing, 'refresh', () => args.workspaceSync.refreshAfterMutation());
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
  pending: { current: Pending | null },
  setReadingError: (error: string) => void) {
    const saved = pending.current;
    if (!saved) return;
    if (saved.token.scope !== getCompanionReadingScope()) { pending.current = null; return; }
    // Daily receipts already register committed changes; a preview would force a full native read.
    const preview = saved.mutation.partial || saved.mutation.session?.daily || saved.mutation.action === 'grade'
      ? undefined : saved.mutation.snapshot;
    const snapshot = await timeFlow(saved.timing, 'refresh', () => args.workspaceSync.refreshAfterMutation(preview));
    if (!snapshot) throw new Error('Could not refresh the saved action.');
    if (confirmFlowMutation(saved.mutation, snapshot)) {
      args.flow.advance(saved.token, saved.mutation.action, snapshot, saved.mutation.now, saved.mutation.session, saved.timing);
    }
    pending.current = null;
    if (saved.mutation.partial) setReadingError('The topic was updated, but some related changes could not be saved.');
    args.floatingBar.revealBar();
  }

async function commitSoonAction(args: CompanionSurfaceActionArgs, token: Token, snapshot: WorkspaceSnapshot, now: string, timing?: FlowTiming) {
  const history = args.flow.historyContext(token);
  const saved = history && token.nodeId ? await commitCompanionFlowHistory({ key: history.key, mode: history.mode,
    entry: createCompanionFlowHistoryEntry({ action: 'soon', nodeId: token.nodeId, now,
      before: snapshot, after: snapshot, history }) }, timing) : null;
  if (saved && typeof saved === 'object' && 'session' in saved) {
    await timeFlow(timing, 'receipt', () => applyCompanionFlowReceipt(saved, snapshot));
  }
  args.flow.advance(token, 'soon', snapshot, now, saved && typeof saved === 'object' && 'session' in saved ? saved.session : undefined, timing);
}

function canSubmitFlowAction(args: CompanionSurfaceActionArgs, token: Token, action: FlowAction) {
  return Boolean(token.nodeId && args.snapshot && args.activity.nodeId === token.nodeId && !args.activity.editing &&
    (action !== 'grade' || args.flow.isAnswerRevealed));
}
