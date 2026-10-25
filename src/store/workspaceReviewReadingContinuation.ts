import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';

import { buildReviewSessionReadingContinuationQueue } from './workspaceReviewLiveQueue';
import { advanceReviewSession } from './workspaceReviewReading';
import { resolveReviewSessionProgress } from './workspaceReviewSessionProgress';

type State = Parameters<typeof buildReviewSessionReadingContinuationQueue>[0];

export function canContinueReadingInFlowWindow(
  summary: { reviewedItemCount: number; continueNodeId: string | null },
  window: { queueNodeIds: string[]; readyNodeIds: string[] }
) {
  return Boolean(summary.reviewedItemCount > 0 && summary.continueNodeId &&
    (window.queueNodeIds.includes(summary.continueNodeId) || window.readyNodeIds.includes(summary.continueNodeId)));
}

export function continueReviewSessionReading(state: State, now: string) {
  const continueNodeId = state.reviewSession.continueNodeId;
  const node = continueNodeId ? state.nodesById[continueNodeId] : undefined;
  if (!continueNodeId || !node || state.trashedNodeIds.includes(continueNodeId)) return null;
  if (!isReadingReviewItemNode(node)) return null;
  const queueNodeIds = buildReviewSessionReadingContinuationQueue(state, now, continueNodeId);
  if (!queueNodeIds.includes(continueNodeId)) return null;
  return advanceReviewSession(state.reviewSession, {
    nextNodeId: continueNodeId,
    queueNodeIds,
    totalNodeCount: resolveReviewSessionProgress(state.reviewSession).reviewCompletedCount + queueNodeIds.length
  });
}
