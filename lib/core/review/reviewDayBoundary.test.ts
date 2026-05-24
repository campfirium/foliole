import { expect, it } from 'vitest';

import {
  normalizeNewDayStartsAtHour,
  normalizeScheduledCardDue,
  resolveScheduledDayStart,
  resolveStoredReviewDueAt
} from './reviewDayBoundary.js';
import type { SchedulerCard } from './types.js';

function createCard(overrides: Partial<SchedulerCard>): SchedulerCard {
  return {
    due: '2026-05-28T23:15:00.000Z',
    last_review: '2026-05-24T23:15:00.000Z',
    state: 2,
    stability: 4,
    difficulty: 4,
    elapsed_days: 4,
    scheduled_days: 4,
    reps: 2,
    lapses: 0,
    ...overrides
  };
}

it('normalizes the configurable new day start hour', () => {
  expect(normalizeNewDayStartsAtHour(0)).toBe(0);
  expect(normalizeNewDayStartsAtHour(23)).toBe(23);
  expect(normalizeNewDayStartsAtHour(4.4)).toBe(4);
  expect(normalizeNewDayStartsAtHour(-1)).toBe(4);
  expect(normalizeNewDayStartsAtHour(24)).toBe(4);
});

it('resolves scheduled day starts from the current configured day', () => {
  expect(resolveScheduledDayStart({
    reviewedAt: '2026-05-24T23:15:00.000Z',
    scheduledDays: 1,
    newDayStartsAtHour: 4
  }).getHours()).toBe(4);
});

it('moves day-based scheduler output to the configured day start', () => {
  const normalized = normalizeScheduledCardDue({
    card: createCard({ scheduled_days: 3 }),
    reviewedAt: '2026-05-24T23:15:00.000Z',
    newDayStartsAtHour: 4
  });

  expect(new Date(normalized.due).getHours()).toBe(4);
});

it('keeps same-day scheduler output at the exact scheduler time', () => {
  const card = createCard({ due: '2026-05-25T00:30:00.000Z', scheduled_days: 0 });

  expect(normalizeScheduledCardDue({
    card,
    reviewedAt: '2026-05-24T23:15:00.000Z',
    newDayStartsAtHour: 4
  })).toBe(card);
});

it('interprets stored day-based due timestamps at the configured start time', () => {
  const dueAt = resolveStoredReviewDueAt({
    due: new Date(2026, 4, 25).toISOString(),
    scheduledDays: 1,
    newDayStartsAtHour: 4
  });

  expect(new Date(dueAt).getHours()).toBe(4);
});
