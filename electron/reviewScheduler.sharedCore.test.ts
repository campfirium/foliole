// @vitest-environment node

import { generatorParameters } from 'ts-fsrs';
import { expect, it } from 'vitest';

import { createFsrsReviewScheduler } from '../lib/core/review/index.js';

const NOW = '2026-03-06T00:00:00.000Z';

function createScheduler(desiredRetention: number) {
  return createFsrsReviewScheduler({
    loadSettings: () => ({
      desiredRetention,
      maximumIntervalDays: 36500,
      enableFuzz: false,
      enableShortTerm: false
    }),
    getSettingsVersion: (settings) => `dr=${settings.desiredRetention.toFixed(2)}`,
    createParameters: (settings) =>
      generatorParameters({
        request_retention: settings.desiredRetention,
        maximum_interval: settings.maximumIntervalDays,
        enable_fuzz: settings.enableFuzz,
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
