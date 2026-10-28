import { resolveReadingAvailableAt } from '../reviewDayBoundary.js';

import type { ReviewQueueNode } from './reviewQueuePlanner.js';

export function resolveReviewQueueReadingDueAt(node: ReviewQueueNode) {
  return node.reading?.nextAt ?? node.createdAt;
}

export function resolveReviewQueueReadingAvailableAt(node: ReviewQueueNode, newDayStartsAtHour: number) {
  return resolveReadingAvailableAt({
    ...(node.reading?.lastHandledAt === undefined ? {} : { lastHandledAt: node.reading.lastHandledAt }),
    newDayStartsAtHour,
    nextAt: resolveReviewQueueReadingDueAt(node)
  });
}
