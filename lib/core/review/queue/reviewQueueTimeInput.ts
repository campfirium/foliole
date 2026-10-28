import { resolveStoredReviewDueAt } from '../reviewDayBoundary.js';

import type { ReviewQueueNode } from './reviewQueuePlanner.js';
import { resolveReviewQueueReadingAvailableAt } from './reviewQueuePlannerReadingPaths.js';
import { parseReviewQueueTimestamp } from './reviewQueuePlannerTime.js';

// These values belong to one immutable planning input, never to a library or session.
export function createReviewQueueTimeInput(readingDayStartsAtHour: number, newDayStartsAtHour: number) {
  const timestamps = new Map<string, number>();
  const reading = new Map<ReviewQueueNode, string>();
  const review = new Map<ReviewQueueNode, number>();
  const timestamp = (value: string) => {
    let numeric = timestamps.get(value);
    if (numeric === undefined) {
      numeric = parseReviewQueueTimestamp(value);
      timestamps.set(value, numeric);
    }
    return numeric;
  };
  const readingAvailableAt = (node: ReviewQueueNode) => {
    let value = reading.get(node);
    if (value === undefined) {
      value = resolveReviewQueueReadingAvailableAt(node, readingDayStartsAtHour);
      reading.set(node, value);
    }
    return value;
  };
  const reviewDueAt = (node: ReviewQueueNode, fallback: string) => {
    if (!node.review) return timestamp(fallback);
    let value = review.get(node);
    if (value === undefined) {
      value = timestamp(resolveStoredReviewDueAt({ due: node.review.due,
        scheduledDays: node.review.scheduledDays, newDayStartsAtHour }));
      review.set(node, value);
    }
    return value;
  };
  return { timestamp, readingAvailableAt, reviewDueAt };
}

export type ReviewQueueTimeInput = ReturnType<typeof createReviewQueueTimeInput>;
