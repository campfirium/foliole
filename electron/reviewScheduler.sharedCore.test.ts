// @vitest-environment node

import { generatorParameters } from 'ts-fsrs';
import { expect, it } from 'vitest';

import {
  assertSchedulerGradeInput,
  assertSchedulerGradeResult,
  assertSchedulerPreviewInput,
  createFsrsReviewScheduler,
  createInitialSchedulerCard
} from '../lib/core/review/index.js';
import type { SchedulerCard, SchedulerGradeInput, SchedulerGradeResult } from '../lib/core/review/index.js';

const NOW = '2026-03-06T00:00:00.000Z';

function createScheduler(desiredRetention: number) {
  return createFsrsReviewScheduler({
    loadSettings: () => ({
      desiredRetention,
      maximumIntervalDays: 36500,
      enableShortTerm: false
    }),
    getSettingsVersion: (settings) => `dr=${settings.desiredRetention.toFixed(2)}`,
    createParameters: (settings) =>
      generatorParameters({
        request_retention: settings.desiredRetention,
        maximum_interval: settings.maximumIntervalDays,
        enable_fuzz: true,
        enable_short_term: settings.enableShortTerm
      })
  });
}

function createInitialCard() {
  return {
    due: NOW,
    last_review: null,
    state: 0 as const,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0
  };
}

function createReviewedCard() {
  return {
    due: NOW,
    last_review: '2026-03-01T00:00:00.000Z',
    state: 2 as const,
    stability: 4.5,
    difficulty: 4.2,
    elapsed_days: 5,
    scheduled_days: 5,
    reps: 6,
    lapses: 1
  };
}

const PREVIEW_RATINGS = ['Again', 'Hard', 'Good', 'Easy'] as const;
const CARD_NUMERIC_FIELDS = [
  'stability',
  'difficulty',
  'elapsed_days',
  'scheduled_days',
  'reps',
  'lapses'
] as const;

function expectValidTimestamp(value: string) {
  expect(Date.parse(value)).not.toBeNaN();
}

function expectValidReviewCard(card: SchedulerCard) {
  expectValidTimestamp(card.due);
  if (card.last_review !== null) {
    expectValidTimestamp(card.last_review);
  }
  expect([0, 1, 2, 3]).toContain(card.state);
  CARD_NUMERIC_FIELDS.forEach((field) => {
    expect(Number.isFinite(card[field])).toBe(true);
    expect(card[field]).toBeGreaterThanOrEqual(0);
  });
}

function expectReviewProgression(before: SchedulerCard, result: SchedulerGradeResult) {
  expect(result.reviewed_at).toBe(NOW);
  expectValidReviewCard(result.card);
  expect(result.card.reps).toBeGreaterThanOrEqual(before.reps);
  expect(result.card.lapses).toBeGreaterThanOrEqual(before.lapses);
}

it('returns Again/Hard/Good/Easy preview payload through shared core', () => {
  const scheduler = createScheduler(0.9);
  const preview = scheduler.preview({
    card: createInitialCard(),
    now: NOW
  });

  expect(Object.keys(preview)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
  expect(preview.Again.reviewed_at).toBe(NOW);
  expect(preview.Hard.reviewed_at).toBe(NOW);
  expect(preview.Good.reviewed_at).toBe(NOW);
  expect(preview.Easy.reviewed_at).toBe(NOW);
  expect(Date.parse(preview.Again.card.due)).not.toBeNaN();
  expect(Date.parse(preview.Hard.card.due)).not.toBeNaN();
  expect(Date.parse(preview.Good.card.due)).not.toBeNaN();
  expect(Date.parse(preview.Easy.card.due)).not.toBeNaN();
});

it('keeps scheduler preview cards inside persisted field invariants', () => {
  const scheduler = createScheduler(0.9);
  const card = createReviewedCard();
  const preview = scheduler.preview({
    card,
    now: NOW
  });

  PREVIEW_RATINGS.forEach((rating) => {
    expectReviewProgression(card, preview[rating]);
  });
});

it('keeps grade result aligned with matching preview rating', () => {
  const scheduler = createScheduler(0.9);
  const card = createReviewedCard();
  const grade = scheduler.grade({
    card,
    rating: 'Good',
    now: NOW
  });
  const preview = scheduler.preview({
    card,
    now: NOW
  });

  expect(grade).toEqual(preview.Good);
});

it('keeps scheduler grade cards inside persisted field invariants', () => {
  const scheduler = createScheduler(0.9);
  const card = createReviewedCard();

  PREVIEW_RATINGS.forEach((rating) => {
    const result = scheduler.grade({
      card,
      rating,
      now: NOW
    });

    expectReviewProgression(card, result);
  });
});

function gradeInput(overrides: Partial<SchedulerGradeInput> = {}): SchedulerGradeInput {
  return {
    card: createInitialSchedulerCard(NOW),
    grade: 3,
    now: NOW,
    ...overrides
  };
}

it('rejects invalid scheduler input timestamps at the shared core contract boundary', () => {
  expect(() => assertSchedulerPreviewInput({ card: createInitialSchedulerCard(NOW), now: '2026-03-06' }))
    .toThrow('Invalid scheduler field "now": expected RFC3339 timestamp');
});

it('rejects invalid scheduler card state at the shared core contract boundary', () => {
  expect(() =>
    assertSchedulerGradeInput(gradeInput({
      card: {
        ...createInitialSchedulerCard(NOW),
        state: 5 as 0
      }
    }))
  ).toThrow('Invalid scheduler field "card.state": expected 0 | 1 | 2 | 3');
});

it('rejects negative scheduler card numbers at the shared core contract boundary', () => {
  expect(() =>
    assertSchedulerGradeInput(gradeInput({
      card: {
        ...createInitialSchedulerCard(NOW),
        scheduled_days: -1
      }
    }))
  ).toThrow('Invalid scheduler field "card.scheduled_days": expected non-negative integer');
});

it('rejects invalid scheduler grades at the shared core contract boundary', () => {
  expect(() => assertSchedulerGradeInput(gradeInput({ grade: 5 as 1 }))).toThrow(
    'Invalid scheduler field "grade": expected 1 | 2 | 3 | 4'
  );
});

it('rejects invalid scheduler result payloads at the shared core contract boundary', () => {
  expect(() =>
    assertSchedulerGradeResult({
      card: {
        ...createInitialSchedulerCard(NOW),
        reps: -1
      },
      reviewed_at: NOW
    })
  ).toThrow('Invalid scheduler field "card.reps": expected non-negative integer');
});

it('rebuilds shared core scheduler preview when desired retention changes', () => {
  const defaultScheduler = createScheduler(0.9);
  const tunedScheduler = createScheduler(0.8);

  const defaultPreview = defaultScheduler.preview({
    card: createReviewedCard(),
    now: NOW
  });
  const tunedPreview = tunedScheduler.preview({
    card: createReviewedCard(),
    now: NOW
  });

  expect(Date.parse(tunedPreview.Good.card.due)).toBeGreaterThan(
    Date.parse(defaultPreview.Good.card.due)
  );
});
