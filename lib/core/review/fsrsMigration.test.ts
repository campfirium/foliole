import { expect, it } from 'vitest';

import { fsrsDefinition, reviewElapsedDays } from './fsrsDefinition.js';
import { createFsrsReviewScheduler } from './fsrsScheduler.js';
import { createReviewSchedulerParameters, DEFAULT_REVIEW_SCHEDULER_SETTINGS, getReviewSchedulerVersion } from './settings.js';
import { createInitialSchedulerCard } from './types.js';

// Captured from ts-fsrs 5.4.2 with fuzz disabled before installing v6.
const baseline = [
  [false, 0, 1, 0.212, 6.4133, 2, 1],
  [false, 0, 2, 1.2931, 5.11217071, 2, 2],
  [false, 0, 3, 2.3065, 2.11810397, 2, 3],
  [false, 0, 4, 8.2956, 1, 2, 8],
  [false, 1, 1, 0.89404614, 8.07880781, 2, 1],
  [false, 1, 2, 11.58605592, 6.13491809, 2, 12],
  [false, 1, 3, 16.28260046, 4.19102837, 2, 16],
  [false, 1, 4, 26.5676324, 2.24713864, 2, 27],
  [false, 2, 1, 0.89404614, 8.07880781, 2, 1],
  [false, 2, 2, 11.58605592, 6.13491809, 2, 12],
  [false, 2, 3, 16.28260046, 4.19102837, 2, 16],
  [false, 2, 4, 26.5676324, 2.24713864, 2, 27],
  [false, 3, 1, 0.89404614, 8.07880781, 2, 1],
  [false, 3, 2, 11.58605592, 6.13491809, 2, 12],
  [false, 3, 3, 16.28260046, 4.19102837, 2, 16],
  [false, 3, 4, 26.5676324, 2.24713864, 2, 27],
  [true, 0, 1, 0.212, 6.4133, 1, 0],
  [true, 0, 2, 1.2931, 5.11217071, 1, 0],
  [true, 0, 3, 2.3065, 2.11810397, 1, 0],
  [true, 0, 4, 8.2956, 1, 2, 8],
  [true, 1, 1, 0.89404614, 8.07880781, 1, 0],
  [true, 1, 2, 11.58605592, 6.13491809, 1, 0],
  [true, 1, 3, 16.28260046, 4.19102837, 1, 0],
  [true, 1, 4, 26.5676324, 2.24713864, 2, 27],
  [true, 2, 1, 0.89404614, 8.07880781, 3, 0],
  [true, 2, 2, 11.58605592, 6.13491809, 2, 12],
  [true, 2, 3, 16.28260046, 4.19102837, 2, 16],
  [true, 2, 4, 26.5676324, 2.24713864, 2, 27],
  [true, 3, 1, 0.89404614, 8.07880781, 3, 0],
  [true, 3, 2, 11.58605592, 6.13491809, 3, 0],
  [true, 3, 3, 16.28260046, 4.19102837, 2, 16],
  [true, 3, 4, 26.5676324, 2.24713864, 2, 27]
] as const;

it.each(baseline)('retains FSRS6 memory for short=%s state=%s grade=%s', (short, state, grade, stability, difficulty, nextState, scheduledDays) => {
  const scheduler = fsrsDefinition.create({ config: {
    ...createReviewSchedulerParameters({ ...DEFAULT_REVIEW_SCHEDULER_SETTINGS, enableShortTerm: short }), enableFuzz: false
  } });
  const card = { cardId: 'persisted-node', dueAt: new Date('2026-11-04T12:00:00Z'), state, scheduleStatus: state === 0 ? 'new' : state === 2 ? 'review' : 'learning',
    lastReviewAt: state ? new Date('2026-11-01T18:00:00Z') : null,
    stability: state ? 4.5 : 0, difficulty: state ? 4.2 : 0,
    scheduledDays: 3, learningStep: 0, reps: state ? 6 : 0, lapses: state ? 1 : 0 } as const;
  const result = scheduler.review({ card, grade, now: new Date('2026-11-05T12:00:00Z') });
  expect(result.card.stability).toBeCloseTo(stability, 7);
  expect(result.card.difficulty).toBeCloseTo(difficulty, 7);
  expect(result.card.state).toBe(nextState);
  expect(result.card.scheduledDays).toBe(scheduledDays);
});

it('keeps UTC calendar elapsed days across midnight and early or overdue review timestamps', () => {
  const scheduler = createFsrsReviewScheduler({ loadSettings: () => DEFAULT_REVIEW_SCHEDULER_SETTINGS,
    createParameters: createReviewSchedulerParameters, getSettingsVersion: getReviewSchedulerVersion });
  for (const due of ['2026-11-01T12:00:00Z', '2026-11-10T12:00:00Z']) {
    const card = { ...createInitialSchedulerCard(due), state: 2 as const, stability: 4.5, difficulty: 4.2,
      reps: 6, lapses: 1, last_review: '2026-11-04T23:00:00Z', elapsed_days: 99 };
    const result = scheduler.grade({ card, nodeId: 'same-node', rating: 'Good', now: '2026-11-05T01:00:00Z' });
    expect(result.card.elapsed_days).toBe(1);
    expect(result.card.last_review).toBe('2026-11-05T01:00:00.000Z');
    expect(card.elapsed_days).toBe(99);
    expect(scheduler.preview({ card, nodeId: 'same-node', now: '2026-11-05T01:00:00Z' }).Good).toEqual(result);
  }
  expect(reviewElapsedDays(new Date('2026-11-01T18:00:00Z'), new Date('2026-11-05T12:00:00Z'))).toBe(4);
});

it('labels new reviews with the active FSRS6 runtime without rewriting stored settings', () => {
  const saved = { ...DEFAULT_REVIEW_SCHEDULER_SETTINGS, algorithm: 'ts-fsrs@5.4.2 using FSRS-6.0' };
  expect(getReviewSchedulerVersion(saved)).toMatch(/^ts-fsrs@6\.0\.0 using FSRS-6\.0\|/);
  expect(saved.algorithm).toBe('ts-fsrs@5.4.2 using FSRS-6.0');
});
