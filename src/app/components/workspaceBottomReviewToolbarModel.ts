import type { ReviewSessionModeAvailability } from '../../features/review/model/reviewSessionMode';

import type { ReviewToolbarProgressCounts } from './reviewToolbarProgressLabel';
import type { WorkspaceBottomReviewToolbarProps, WorkspaceBottomReviewToolbarSource } from './WorkspaceBottomReviewToolbar';

export function getReviewSessionModeAvailability(source: WorkspaceBottomReviewToolbarSource): ReviewSessionModeAvailability {
  let hasReview = false;
  let hasReading = false;
  for (const nodeId of source.review.reviewPanelQueueNodeIds) {
    const kind = source.nodeList.nodesById[nodeId]?.kind;
    if (kind === 'item') hasReview = true;
    if (kind === 'topic') hasReading = true;
  }
  return {
    recommended: hasReview || hasReading,
    'review-first': hasReview,
    'reading-only': hasReading
  };
}

export function getReviewCurrentTitle(source: WorkspaceBottomReviewToolbarSource) {
  const currentNodeId = source.review.reviewCurrentNodeId;
  return currentNodeId ? source.nodeList.nodesById[currentNodeId]?.title : undefined;
}

export function getReviewProgressCounts(source: WorkspaceBottomReviewToolbarSource): ReviewToolbarProgressCounts {
  const existingCounts = (source.review as Partial<WorkspaceBottomReviewToolbarProps>).reviewProgressCounts;
  if (existingCounts) return existingCounts;

  const queueNodeIds = (source.review as { reviewQueueNodeIds?: string[] }).reviewQueueNodeIds ?? [];
  let queuedItemCount = 0;
  let queuedTopicCount = 0;
  for (const nodeId of queueNodeIds) {
    const kind = source.nodeList.nodesById[nodeId]?.kind;
    if (kind === 'item') queuedItemCount += 1;
    if (kind === 'topic') queuedTopicCount += 1;
  }
  return {
    completedItemCount: source.review.reviewSummary.reviewedItemCount,
    completedTopicCount: source.review.reviewSummary.readTopicCount,
    queuedItemCount,
    queuedTopicCount
  };
}
