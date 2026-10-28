import { createFsrsReviewScheduler } from './fsrsScheduler.js';
import { isReviewTimestamp } from './reviewTimestamp.js';
import { createReviewSchedulerParameters, getReviewSchedulerVersion, type ReviewSchedulerSettings } from './settings.js';
import { createInitialSchedulerCard, mapGradeToRustRating, type SchedulerCard } from './types.js';

export interface ReviewEvent {
  op_id: string;
  reviewed_at: string;
  kind: 'review' | 'reset' | 'void';
  grade: number;
  voids_op_id: string | null;
}

/** Events are immutable facts; snapshots and event scheduler versions never seed this calculation. */
export function recomputeReview(events: readonly ReviewEvent[], parameters: ReviewSchedulerSettings): SchedulerCard | null {
  return replayReviewEventsFromBaseline(events, parameters, null);
}

/** A browser import may carry an explicit pre-event profile; native replay always supplies null. */
export function replayReviewEventsFromBaseline(events: readonly ReviewEvent[], parameters: ReviewSchedulerSettings,
  baseline: SchedulerCard | null): SchedulerCard | null {
  const voids = new Set(events.filter(event => event.kind === 'void').map(event => event.voids_op_id));
  const ordered = events.map(event => ({ ...event, instant: reviewInstant(event.reviewed_at) }))
    .sort((a, b) => a.instant - b.instant
    || (a.op_id < b.op_id ? -1 : a.op_id > b.op_id ? 1 : 0));
  const scheduler = createFsrsReviewScheduler({ loadSettings: () => parameters,
    getSettingsVersion: getReviewSchedulerVersion, createParameters: createReviewSchedulerParameters });
  let card: SchedulerCard | null = baseline;
  for (const event of ordered) {
    if (event.kind === 'reset') card = null;
    if (event.kind !== 'review' || voids.has(event.op_id)) continue;
    const grade = event.grade;
    if (grade !== 1 && grade !== 2 && grade !== 3 && grade !== 4) throw new Error('invalid_review_grade');
    // Keep absolute scheduler timestamps. Local day-boundary display belongs to the consumer,
    // otherwise identical facts produce different persisted values in different time zones.
    card = scheduler.grade({ card: card ?? createInitialSchedulerCard(event.reviewed_at),
      rating: mapGradeToRustRating(grade), now: event.reviewed_at }).card;
  }
  return card;
}

/** Preview the candidate at its event time; persistence still projects the complete immutable history. */
export function previewReviewAt(events: readonly ReviewEvent[], parameters: ReviewSchedulerSettings,
  candidate: { grade: number; now: string }): SchedulerCard | null {
  const instant = reviewInstant(candidate.now);
  const history = events.filter(event => reviewInstant(event.reviewed_at) <= instant);
  return recomputeReview([...history, { op_id: '~preview', kind: 'review', grade: candidate.grade,
    reviewed_at: candidate.now, voids_op_id: null }], parameters);
}

function reviewInstant(value: string) {
  if (!isReviewTimestamp(value, true)) throw new Error('invalid_review_timestamp');
  return Date.parse(value);
}
