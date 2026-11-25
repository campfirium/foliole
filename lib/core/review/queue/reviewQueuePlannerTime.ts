import { isReviewReadyAt, type ReviewDayWindow } from '../reviewReadiness.js';

export function parseReviewQueueTimestamp(timestamp: string) {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    throw new TypeError(`Invalid timestamp: ${timestamp}`);
  }
  return parsed;
}

/** Grading guard: the same readiness rule the planner uses to put the card in today's queue. */
export function isReviewProfileDue(
  review: { due: string; scheduledDays: number } | null | undefined,
  now: string,
  newDayStartsAtHour: number,
  dayWindow?: ReviewDayWindow
) {
  return isReviewReadyAt(review, now, { newDayStartsAtHour, dayWindow });
}
