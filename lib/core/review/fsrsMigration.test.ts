import { FSRS7_DEFAULT_WEIGHTS, FSRS7Model } from 'ts-fsrs/models/fsrs-7';
import { expect, it } from 'vitest';

import { fsrsDefinition, reviewElapsedDays } from './fsrsDefinition.js';
import { createFsrsReviewScheduler } from './fsrsScheduler.js';
import { createReviewSchedulerParameters, DEFAULT_REVIEW_SCHEDULER_SETTINGS, getReviewSchedulerVersion } from './settings.js';
import { createInitialSchedulerCard } from './types.js';

const model = FSRS7Model.create({ config: { weights: [...FSRS7_DEFAULT_WEIGHTS] } });
const cases = [false, true].flatMap(short => [0, 1, 2, 3].flatMap(state =>
  [1, 2, 3, 4].map(grade => ({ short, state, grade }))));

it.each(cases)('uses FSRS7 memory for short=$short state=$state grade=$grade', ({ short, state, grade }) => {
  const scheduler = fsrsDefinition.create({ config: {
    ...createReviewSchedulerParameters({ ...DEFAULT_REVIEW_SCHEDULER_SETTINGS, enableShortTerm: short }), enableFuzz: false
  } });
  const previous = model.step({ memoryState: null, rating: 3, elapsedDays: 0 });
  const card = { ...scheduler.newCard({ cardId: 'persisted-node', now: new Date('2026-11-04T12:00:00Z') }),
    ...(state ? previous : {}), state: state as 0 | 1 | 2 | 3,
    scheduleStatus: state === 0 ? 'new' as const : state === 2 ? 'review' as const : 'learning' as const,
    lastReviewAt: state ? new Date('2026-11-01T18:00:00Z') : null, reps: state ? 6 : 0, lapses: state ? 1 : 0 };
  const result = scheduler.review({ card, grade: grade as 1 | 2 | 3 | 4, now: new Date('2026-11-05T12:00:00Z') });
  const expected = model.step({ memoryState: state ? previous : null, rating: grade as 1 | 2 | 3 | 4, elapsedDays: state ? 3.75 : 0 });
  expect(result.card.stability).toBeCloseTo(expected.stability, 7);
  expect(result.card.stabilityFast).toBeCloseTo(expected.stabilityFast, 7);
  expect(result.card.difficulty).toBeCloseTo(expected.difficulty, 7);
  expect(result.card.reps).toBe(card.reps + 1);
  expect(result.card.dueAt.getTime()).toBeGreaterThan(Date.parse('2026-11-05T12:00:00Z'));
});

it('keeps fractional elapsed time across midnight for early and overdue reviews', () => {
  const scheduler = createFsrsReviewScheduler({ loadSettings: () => DEFAULT_REVIEW_SCHEDULER_SETTINGS,
    createParameters: createReviewSchedulerParameters, getSettingsVersion: getReviewSchedulerVersion });
  for (const due of ['2026-11-01T12:00:00Z', '2026-11-10T12:00:00Z']) {
    const memory = model.step({ memoryState: null, rating: 3, elapsedDays: 0 });
    const card = { ...createInitialSchedulerCard(due), ...memory, stability_fast: memory.stabilityFast,
      state: 2 as const, reps: 6, lapses: 1, last_review: '2026-11-04T23:00:00Z', elapsed_days: 99 };
    const result = scheduler.grade({ card, nodeId: 'same-node', rating: 'Good', now: '2026-11-05T01:00:00Z' });
    expect(result.card.elapsed_days).toBeCloseTo(2 / 24);
    expect(result.card.last_review).toBe('2026-11-05T01:00:00.000Z');
    expect(card.elapsed_days).toBe(99);
    expect(scheduler.preview({ card, nodeId: 'same-node', now: '2026-11-05T01:00:00Z' }).Good).toEqual(result);
  }
  expect(reviewElapsedDays(new Date('2026-11-01T18:00:00Z'), new Date('2026-11-05T12:00:00Z'))).toBe(3.75);
});

it('labels every new review as FSRS7 without rewriting historical settings', () => {
  const saved = { ...DEFAULT_REVIEW_SCHEDULER_SETTINGS, algorithm: 'ts-fsrs@5.4.2 using FSRS-6.0' };
  expect(getReviewSchedulerVersion(saved)).toMatch(/^ts-fsrs@6\.0\.0 using FSRS-7\.0\|/);
  expect(saved.algorithm).toBe('ts-fsrs@5.4.2 using FSRS-6.0');
});
