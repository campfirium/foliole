import { afterEach, expect, it } from 'vitest';

import { createFsrsReviewScheduler } from './fsrsScheduler.js';
import { previewReviewAt, recomputeReview, type ReviewEvent } from './recomputeReview.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, createReviewSchedulerParameters, getReviewSchedulerVersion } from './settings.js';
import { createInitialSchedulerCard } from './types.js';

const tz = process.env.TZ;
afterEach(() => { if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz; });
const events: ReviewEvent[] = Array.from({ length: 20 }, (_, index) => ({
  op_id: `review-${String(index).padStart(2, '0')}`, kind: 'review', grade: index % 4 + 1,
  reviewed_at: new Date(Date.UTC(2026, 2, 1 + index * 5, 9)).toISOString(), voids_op_id: null
}));

it.each([false, true])('rebuilds deterministically with fuzz enabled and short-term=%s across timezone and arrival order', enableShortTerm => {
  const parameters = { ...DEFAULT_REVIEW_SCHEDULER_SETTINGS, enableShortTerm };
  process.env.TZ = 'Asia/Shanghai';
  const expected = recomputeReview(events, parameters);
  process.env.TZ = 'America/Los_Angeles';
  expect(recomputeReview([...events].reverse(), parameters)).toEqual(expected);
  process.env.TZ = 'UTC';
  expect(recomputeReview(events, parameters)).toEqual(expected);
  expect(expected?.reps).toBe(20);
});

it('orders equal instants by op_id and resolves voids before their targets regardless of arrival', () => {
  const at = '2026-10-25T08:00:00.000Z';
  const a: ReviewEvent = { op_id: 'a', reviewed_at: at, kind: 'review', grade: 1, voids_op_id: null };
  const b: ReviewEvent = { op_id: 'b', reviewed_at: '2026-10-25T16:00:00+08:00', kind: 'review', grade: 4, voids_op_id: null };
  const v: ReviewEvent = { op_id: 'v', reviewed_at: at, kind: 'void', grade: 0, voids_op_id: 'a' };
  const settings = DEFAULT_REVIEW_SCHEDULER_SETTINGS;
  expect(recomputeReview([b, a], settings)).toEqual(recomputeReview([a, b], settings));
  expect(recomputeReview([v, b, a], settings)).toEqual(recomputeReview([b], settings));
  const scheduler = createFsrsReviewScheduler({ loadSettings: () => settings,
    getSettingsVersion: getReviewSchedulerVersion, createParameters: createReviewSchedulerParameters });
  expect(recomputeReview([v, b, a], settings)).toEqual(scheduler.grade({
    card: createInitialSchedulerCard(at), now: at, rating: 'Easy'
  }).card);
});

it('starts from new at resets and uses the current parameters for every effective score', () => {
  const reset: ReviewEvent = { op_id: 'zz-reset', kind: 'reset', grade: 0,
    reviewed_at: events[10]!.reviewed_at, voids_op_id: null };
  const settings = { ...DEFAULT_REVIEW_SCHEDULER_SETTINGS, desiredRetention: 0.99 };
  expect(recomputeReview([...events, reset], settings)).toEqual(recomputeReview(events.slice(11), settings));
  expect(recomputeReview([events[0]!, { ...reset, reviewed_at: events[1]!.reviewed_at }], settings)).toBeNull();
});

it('rejects ambiguous local timestamps instead of interpreting the same fact differently per host', () => {
  for (const zone of ['Asia/Shanghai', 'America/Los_Angeles']) {
    process.env.TZ = zone;
    expect(() => recomputeReview([{ ...events[0]!, reviewed_at: '2026-10-25T08:00:00' }],
      DEFAULT_REVIEW_SCHEDULER_SETTINGS)).toThrow('invalid_review_timestamp');
  }
});

it.each(['2026-02-32T12:00:00Z', '2026-13-01', '2026-04-31T12:60:00+08:00'])('rejects unparseable event dates before replay: %s', reviewed_at => {
  expect(() => recomputeReview([{ ...events[0]!, reviewed_at }], DEFAULT_REVIEW_SCHEDULER_SETTINGS))
    .toThrow('invalid_review_timestamp');
});

it.each([
  ['2026-02-30T12:00:00Z', '2026-03-02T12:00:00.000Z'],
  ['2025-02-29', '2025-03-01T00:00:00.000Z'],
  ['2026-04-31T12:00:00+08:00', '2026-05-01T04:00:00.000Z'],
  ['2026-02-30t12:00:00.123456z', '2026-03-02T12:00:00.123Z'],
  ['2026-02-30T24:00Z', '2026-03-03T00:00:00.000Z'],
  ['2026-02-30 12:00:00Z', '2026-03-02T12:00:00.000Z']
])('uses the old instant for stored %s, while rejecting it as a new score time', (legacy, canonical) => {
  const parameters = DEFAULT_REVIEW_SCHEDULER_SETTINGS;
  const history = [{ ...events[0]!, reviewed_at: legacy }];
  const control = [{ ...events[0]!, reviewed_at: canonical }];
  for (const zone of ['Asia/Shanghai', 'America/Los_Angeles']) {
    process.env.TZ = zone;
    expect(recomputeReview(history, parameters)).toEqual(recomputeReview(control, parameters));
    expect(recomputeReview(history, parameters)?.last_review).toBe(canonical);
    expect(previewReviewAt(history, parameters, { grade: 3, now: '2026-05-02T00:00:00Z' }))
      .toEqual(previewReviewAt(control, parameters, { grade: 3, now: '2026-05-02T00:00:00Z' }));
  }
  expect(() => previewReviewAt([], parameters, { grade: 3, now: legacy })).toThrow('invalid_review_timestamp');
});

it('retains valid date-only review facts as absolute UTC dates', () => {
  expect(recomputeReview([{ ...events[0]!, reviewed_at: '2024-02-29' }], DEFAULT_REVIEW_SCHEDULER_SETTINGS))
    .toEqual(recomputeReview([{ ...events[0]!, reviewed_at: '2024-02-29T00:00:00.000Z' }], DEFAULT_REVIEW_SCHEDULER_SETTINGS));
});

it('previews a backdated score at its event time without changing the full-history projection', () => {
  const now = '2026-10-26T08:00:00.000Z';
  const parameters = DEFAULT_REVIEW_SCHEDULER_SETTINGS;
  const future: ReviewEvent = { op_id: 'future-reset', kind: 'reset', grade: 0,
    reviewed_at: '2099-01-01T00:00:00.000Z', voids_op_id: null };
  const candidate: ReviewEvent = { op_id: 'candidate', kind: 'review', grade: 3,
    reviewed_at: now, voids_op_id: null };
  expect(previewReviewAt([...events, future], parameters, { grade: 3, now }))
    .toEqual(recomputeReview([...events, candidate], parameters));
  expect(recomputeReview([...events, future, candidate], parameters)).toBeNull();
  const next = { ...events[0]!, op_id: 'future-review', reviewed_at: '2099-01-02T00:00:00.000Z' };
  expect(previewReviewAt([...events, future, next], parameters, { grade: 3, now }))
    .toEqual(previewReviewAt(events, parameters, { grade: 3, now }));
});
