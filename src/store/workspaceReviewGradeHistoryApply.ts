import { appliedWorkspaceHistory, type WorkspaceHistoryApplyResult } from './workspaceHistoryApplyResult';
import {
  applyWorkspaceHistoryContext,
  isSameWorkspaceReviewSession
} from './workspaceHistoryContext';
import { getWorkspaceHistoryPersistence } from './workspaceHistoryPersistence';
import {
  cloneReviewProfile,
  isSameReviewProfile,
  type WorkspaceReviewGradeHistoryEntry
} from './workspaceReviewGradeActionHistory';
import type { WorkspaceState } from './workspaceStore';

function isApplicable(
  state: WorkspaceState,
  entry: WorkspaceReviewGradeHistoryEntry,
  mode: 'redo' | 'undo'
) {
  const node = state.nodesById[entry.nodeId];
  const expectedReview = mode === 'undo' ? entry.afterReview : entry.beforeReview;
  const sourceContext = mode === 'undo' ? entry.afterContext : entry.beforeContext;
  return Boolean(
    node &&
    !state.trashedNodeIds.includes(entry.nodeId) &&
    isSameReviewProfile(node.review, expectedReview) &&
    isSameWorkspaceReviewSession(state.reviewSession, sourceContext.reviewSession)
  );
}

export async function applyWorkspaceReviewGradeHistory(args: {
  entry: WorkspaceReviewGradeHistoryEntry;
  get: () => WorkspaceState;
  mode: 'redo' | 'undo';
  mutationTimestamp: string;
}): Promise<WorkspaceHistoryApplyResult> {
  if (!isApplicable(args.get(), args.entry, args.mode)) return { status: 'invalid' };
  const nextReview = args.mode === 'undo' ? args.entry.beforeReview : args.entry.afterReview;
  try {
    const persisted = await getWorkspaceHistoryPersistence()
      .persistReviewSnapshot(args.entry.nodeId, nextReview, args.mutationTimestamp);
    if (!persisted) return { status: 'failed' };
  } catch {
    return { status: 'failed' };
  }
  const latest = args.get();
  if (!isApplicable(latest, args.entry, args.mode)) return { status: 'invalid' };
  const context = args.mode === 'undo' ? args.entry.beforeContext : args.entry.afterContext;
  return appliedWorkspaceHistory({ ...args.entry, mutationTimestamp: args.mutationTimestamp }, {
    ...applyWorkspaceHistoryContext(context),
    nodesById: {
      ...latest.nodesById,
      [args.entry.nodeId]: {
        ...latest.nodesById[args.entry.nodeId]!,
        review: cloneReviewProfile(nextReview)
      }
    }
  });
}
