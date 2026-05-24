import type { ReviewSessionMode } from '../../features/review/model/reviewSessionMode';

export interface ReviewToolbarProgressCounts {
  completedItemCount: number;
  completedTopicCount: number;
  queuedItemCount: number;
  queuedTopicCount: number;
}

function progressSegment(prefix: string, completed: number, queued: number) {
  const total = Math.max(completed, 0) + Math.max(queued, 0);
  return total > 0 ? `${prefix} ${Math.min(Math.max(completed, 0), total)}/${total}` : null;
}

export function fallbackProgressCounts(mode: ReviewSessionMode, completed: number, queued: number): ReviewToolbarProgressCounts {
  if (mode === 'reading-only') {
    return {
      completedItemCount: 0,
      completedTopicCount: completed,
      queuedItemCount: 0,
      queuedTopicCount: queued
    };
  }
  if (mode === 'review-first') {
    return {
      completedItemCount: completed,
      completedTopicCount: 0,
      queuedItemCount: queued,
      queuedTopicCount: 0
    };
  }
  return {
    completedItemCount: completed,
    completedTopicCount: 0,
    queuedItemCount: queued,
    queuedTopicCount: 0
  };
}

export function formatReviewProgressLabel(mode: ReviewSessionMode, progressCounts: ReviewToolbarProgressCounts) {
  const itemSegment =
    mode === 'reading-only' ? null : progressSegment('i', progressCounts.completedItemCount, progressCounts.queuedItemCount);
  const topicSegment =
    mode === 'review-first' ? null : progressSegment('t', progressCounts.completedTopicCount, progressCounts.queuedTopicCount);
  return [itemSegment, topicSegment].filter(Boolean).join(' · ');
}
