import { resolveStoredReviewDueAt } from '../../lib/core/review/reviewDayBoundary.js';

export function parseReviewQueueTimestamp(timestamp: string) {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    throw new TypeError(`Invalid timestamp: ${timestamp}`);
  }
  return parsed;
}

export function isReviewProfileDue(
  review: { due: string; scheduledDays: number } | null | undefined,
  now: string,
  newDayStartsAtHour: number
) {
  const dueAt = resolveStoredReviewDueAt({
    due: review?.due ?? now,
    scheduledDays: review?.scheduledDays ?? 0,
    newDayStartsAtHour
  });
  return parseReviewQueueTimestamp(dueAt) <= parseReviewQueueTimestamp(now);
}
