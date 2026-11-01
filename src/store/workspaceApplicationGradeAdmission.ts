import { dailyFlowOperationId } from '../../lib/core/flow/dailyFlowRetry';
import type { ReviewGrade } from '../features/review/model/reviewTypes';

import { createWorkspaceActionHistoryEntryId } from './workspaceActionHistoryEntry';
import { admitApplicationAction, settleApplicationAction } from './workspaceApplicationActionAdmission';
import { captureWorkspaceHistoryContext } from './workspaceHistoryContext';
import { createReviewGradeHistoryEntry } from './workspaceReviewGradeActionHistory';
import type { WorkspaceState } from './workspaceStoreTypes';

type Set = (patch: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)) => void;

export async function reserveApplicationGrade(set: Set, get: () => WorkspaceState, grade: ReviewGrade, now: string,
  execute: (grade: ReviewGrade, now: string, id?: string) => Promise<boolean>) {
  const before = get();
  const nodeId = before.reviewSession.currentNodeId;
  if (!before.appActionHistory.application || !nodeId || !before.reviewSession.isAnswerRevealed || before.activeNodeId !== nodeId)
    return execute(grade, now);
  const id = before.reviewSession.daily ? dailyFlowOperationId(before.reviewSession.daily, nodeId, `grade:${grade}`) : createWorkspaceActionHistoryEntryId();
  const context = captureWorkspaceHistoryContext(before);
  admitApplicationAction(set, createReviewGradeHistoryEntry({ id, nodeId, mutationTimestamp: now,
    beforeReview: before.nodesById[nodeId]?.review ?? null, afterReview: before.nodesById[nodeId]?.review ?? null,
    beforeContext: context, afterContext: context }));
  try { return await execute(grade, now, id); }
  finally {
    const pending = get().appActionHistory.application?.undo.find(value => value.id === id);
    if (pending && !pending.ready) set(state => settleApplicationAction(state, id, null));
  }
}
