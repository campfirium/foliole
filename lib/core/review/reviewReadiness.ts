import { resolveStoredReviewDueAt } from './reviewDayBoundary.js';

/** A learning day fixed by the device that opened today's Flow, shared with every other device. */
export interface ReviewDayWindow { start: string; end: string }

export interface ReviewDayContext {
  newDayStartsAtHour: number;
  dayWindow?: ReviewDayWindow | undefined;
}

type ReviewDueFacts = { due: string; scheduledDays: number };
type ReviewDayBounds = { start: number; end: number };

function parseReviewInstant(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new TypeError(`Invalid timestamp: ${value}`);
  return parsed;
}

/** The shared day governs readiness until it ends; afterwards each host falls back to its own learning day. */
export function activeReviewDayWindow<T extends ReviewDayWindow>(window: T | undefined, now: string): T | undefined {
  return window && Date.parse(now) < Date.parse(window.end) ? window : undefined;
}

/**
 * The one instant a stored review becomes gradable. Enqueueing, grading, readiness rows and counters all
 * derive from it. Day-scale reviews wait for the learning-day start of their due date, and inside the
 * shared day they are ready from its start; learning steps keep their exact due.
 */
export function resolveReviewReadyAt(review: ReviewDueFacts, newDayStartsAtHour: number,
  window?: ReviewDayBounds, parse: (value: string) => number = parseReviewInstant) {
  const dayStartDue = parse(resolveStoredReviewDueAt({ due: review.due, scheduledDays: review.scheduledDays, newDayStartsAtHour }));
  if (!window || review.scheduledDays < 1) return dayStartDue;
  return dayStartDue >= window.start && dayStartDue < window.end ? window.start : dayStartDue;
}

export function isReviewReadyAt(review: ReviewDueFacts | null | undefined, now: string, context: ReviewDayContext) {
  const window = activeReviewDayWindow(context.dayWindow, now);
  const bounds = window ? { start: parseReviewInstant(window.start), end: parseReviewInstant(window.end) } : undefined;
  return resolveReviewReadyAt(review ?? { due: now, scheduledDays: 0 }, context.newDayStartsAtHour, bounds)
    <= parseReviewInstant(now);
}
