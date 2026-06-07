import { FIXED_TIMESTAMP } from './app-smoke.shared';

export function createReadingProfile(nextAt: string) {
  return {
    intervalDurationMs: 24 * 60 * 60 * 1000,
    intervalGrowthFactor: 1.3,
    lastHandledAt: '2026-02-24T00:00:00.000Z',
    nextAt,
    priority: 5 as const,
    readingPosition: 0,
    repetitionCount: 1,
    state: 'active' as const
  };
}

export function createDueReview() {
  return {
    due: FIXED_TIMESTAMP,
    lastReviewAt: null,
    state: 0 as const,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0
  };
}
