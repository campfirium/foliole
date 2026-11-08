import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import type { DailyFlowLearningReceipt } from '../../lib/core/flow/dailyFlowContract';
import { reviewHistoryOpId } from '../../lib/core/review/reviewEventIdentity';
import { toNodeReviewProfile } from '../features/review/model/reviewTypes';

import { hasPersistentDailyFlow, hasTargetedDailyFlow, saveDailyHistory } from './workspaceDailyFlowMutations';
import { mergeDailyFlowReceiptNodes } from './workspaceDailyFlowReceipt';
import { appliedWorkspaceHistory, type WorkspaceHistoryApplyResult, type WorkspaceHistoryExecution } from './workspaceHistoryApplyResult';
import { applyWorkspaceHistoryContext } from './workspaceHistoryContext';
import { getWorkspaceHistoryPersistence } from './workspaceHistoryPersistence';
import { buildReviewActiveNodeContext } from './workspaceReviewBrowseRoot';
import type { WorkspaceReviewGradeHistoryEntry } from './workspaceReviewGradeActionHistory';
import { resolveWorkspaceReviewHistoryTarget } from './workspaceReviewHistoryTarget';
import { resolveEarliestReviewDueAt } from './workspaceReviewSessionProgress';
import type { WorkspaceState } from './workspaceStore';

export async function applyWorkspaceReviewGradeHistory(args: {
  execution?: WorkspaceHistoryExecution;
  entry: WorkspaceReviewGradeHistoryEntry;
  get: () => WorkspaceState;
  mode: 'redo' | 'undo';
  mutationTimestamp: string;
}): Promise<WorkspaceHistoryApplyResult> {
  const prepare = () => resolveWorkspaceReviewHistoryTarget({ ...args.get(), entry: args.entry, mode: args.mode });
  if (!prepare()) return { status: 'invalid' };
  const nextReview = args.mode === 'undo' ? args.entry.beforeReview : args.entry.afterReview;
  let reviewResult: { review: import('../features/nodes/model/nodeTypes').NodeReviewProfile | null } | null = null;
  let dailySession: WorkspaceState['reviewSession'] | undefined;
  const beforeNodes = args.get().nodesById;
  let learning: Record<string, DailyFlowLearningReceipt> | undefined;
  let displayNodes: Record<string, WorkspaceNodeSnapshot> | undefined;
  if (args.execution && !args.execution.beforeSubmit()) return { status: 'invalid' };
  try {
    const persisted = hasPersistentDailyFlow(args.get().reviewSession)
      ? await saveDailyHistory({ session: args.get().reviewSession, entry: args.entry, mode: args.mode, now: args.mutationTimestamp, knownNodes: args.get().nodesById })
      : await getWorkspaceHistoryPersistence()
      .persistReviewSnapshot(args.entry.nodeId, nextReview, args.mutationTimestamp, {
        mode: args.mode, targetOpId: args.entry.reviewOpId ?? args.entry.id
      });
    if (!persisted) return { status: 'failed' };
    if (typeof persisted !== 'boolean' && 'session' in persisted) {
      dailySession = persisted.session;
      displayNodes = persisted.nodes;
      learning = persisted.learning;
      args.mutationTimestamp = persisted.mutationTimestamp ?? args.mutationTimestamp;
      reviewResult = { review: persisted.card ? toNodeReviewProfile(persisted.card) : null };
    } else if (typeof persisted !== 'boolean') reviewResult = persisted;
  } catch { return { status: 'failed' }; }
  args.execution?.committed({ ...args.entry, mutationTimestamp: args.mutationTimestamp,
    ...(reviewResult ? args.mode === 'undo' ? { beforeReview: reviewResult.review } : { afterReview: reviewResult.review } : {}),
    ...(args.mode === 'redo' ? { reviewOpId: reviewHistoryOpId(args.entry.reviewOpId ?? args.entry.id, args.mutationTimestamp, 'redo') } : {}) });
  const applied = prepare();
  if (!applied) return { status: 'invalid' };
  const nodesById = reviewResult && !hasTargetedDailyFlow(args.get().reviewSession) ? { ...applied.nodesById, [args.entry.nodeId]: {
    ...applied.nodesById[args.entry.nodeId]!, review: reviewResult.review } } : applied.nodesById;
  const context = reviewResult && args.mode === 'redo' ? { ...applied.context,
    reviewSession: { ...applied.context.reviewSession, nextReviewDueAt: resolveEarliestReviewDueAt(
      args.entry.beforeContext.reviewSession.nextReviewDueAt, reviewResult.review?.due) } } : applied.context;
  return appliedWorkspaceHistory({ ...args.entry,
    ...(args.mode === 'redo' ? { afterContext: context } : {}),
    ...(reviewResult ? args.mode === 'undo' ? { beforeReview: reviewResult.review } : { afterReview: reviewResult.review } : {}),
    mutationTimestamp: args.mutationTimestamp,
    ...(args.mode === 'redo' ? { reviewOpId: reviewHistoryOpId(args.entry.reviewOpId ?? args.entry.id, args.mutationTimestamp, 'redo') } : {}) }, {
    ...applyWorkspaceHistoryContext(context),
    ...(dailySession ? { reviewSession: dailySession,
      ...(context.reviewSession.dive ? buildReviewActiveNodeContext(args.get(), dailySession.currentNodeId) : {}) } : {}),
    nodesById: mergeDailyFlowReceiptNodes(nodesById, beforeNodes, displayNodes, learning)
  });
}
