import { reviewHistoryOpId } from '../../lib/core/review/reviewEventIdentity';

import { appliedWorkspaceHistory, type WorkspaceHistoryApplyResult } from './workspaceHistoryApplyResult';
import { applyWorkspaceHistoryContext } from './workspaceHistoryContext';
import { getWorkspaceHistoryPersistence } from './workspaceHistoryPersistence';
import type { WorkspaceReviewGradeHistoryEntry } from './workspaceReviewGradeActionHistory';
import { resolveWorkspaceReviewHistoryTarget } from './workspaceReviewHistoryTarget';
import { resolveEarliestReviewDueAt } from './workspaceReviewSessionProgress';
import type { WorkspaceState } from './workspaceStore';

export async function applyWorkspaceReviewGradeHistory(args: {
  entry: WorkspaceReviewGradeHistoryEntry;
  get: () => WorkspaceState;
  mode: 'redo' | 'undo';
  mutationTimestamp: string;
}): Promise<WorkspaceHistoryApplyResult> {
  const prepare = () => resolveWorkspaceReviewHistoryTarget({ ...args.get(), entry: args.entry, mode: args.mode });
  if (!prepare()) return { status: 'invalid' };
  const nextReview = args.mode === 'undo' ? args.entry.beforeReview : args.entry.afterReview;
  let reviewResult: { review: import('../features/nodes/model/nodeTypes').NodeReviewProfile | null } | null = null;
  try {
    const persisted = await getWorkspaceHistoryPersistence()
      .persistReviewSnapshot(args.entry.nodeId, nextReview, args.mutationTimestamp, {
        mode: args.mode, targetOpId: args.entry.reviewOpId ?? args.entry.id
      });
    if (!persisted) return { status: 'failed' };
    if (typeof persisted !== 'boolean') reviewResult = persisted;
  } catch { return { status: 'failed' }; }
  const applied = prepare();
  if (!applied) return { status: 'invalid' };
  const nodesById = reviewResult ? { ...applied.nodesById, [args.entry.nodeId]: {
    ...applied.nodesById[args.entry.nodeId]!, review: reviewResult.review } } : applied.nodesById;
  const context = reviewResult && args.mode === 'redo' ? { ...applied.context,
    reviewSession: { ...applied.context.reviewSession, nextReviewDueAt: resolveEarliestReviewDueAt(
      args.entry.beforeContext.reviewSession.nextReviewDueAt, reviewResult.review?.due) } } : applied.context;
  return appliedWorkspaceHistory({ ...args.entry,
    ...(args.mode === 'redo' ? { afterContext: context } : {}),
    ...(reviewResult ? args.mode === 'undo' ? { beforeReview: reviewResult.review } : { afterReview: reviewResult.review } : {}),
    mutationTimestamp: args.mutationTimestamp,
    ...(args.mode === 'redo' ? { reviewOpId: reviewHistoryOpId(args.entry.reviewOpId ?? args.entry.id, args.mutationTimestamp, 'redo') } : {}) }, {
    ...applyWorkspaceHistoryContext(context), nodesById
  });
}
