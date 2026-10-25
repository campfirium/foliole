import { appliedWorkspaceHistory, type WorkspaceHistoryApplyResult } from './workspaceHistoryApplyResult';
import { applyWorkspaceHistoryContext } from './workspaceHistoryContext';
import { getWorkspaceHistoryPersistence } from './workspaceHistoryPersistence';
import type { WorkspaceReviewGradeHistoryEntry } from './workspaceReviewGradeActionHistory';
import { resolveWorkspaceReviewHistoryTarget } from './workspaceReviewHistoryTarget';
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
  if (!nextReview) return { status: 'invalid' };
  try {
    const persisted = await getWorkspaceHistoryPersistence()
      .persistReviewSnapshot(args.entry.nodeId, nextReview, args.mutationTimestamp);
    if (!persisted) return { status: 'failed' };
  } catch { return { status: 'failed' }; }
  const applied = prepare();
  if (!applied) return { status: 'invalid' };
  return appliedWorkspaceHistory({ ...args.entry, mutationTimestamp: args.mutationTimestamp }, {
    ...applyWorkspaceHistoryContext(applied.context), nodesById: applied.nodesById
  });
}
