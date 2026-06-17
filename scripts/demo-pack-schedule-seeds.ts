import type { DemoPackReadingSeed, DemoPackReviewScheduleSeed } from '../src/demo/demoPack.js';

export function createDemoReadingSeed(index: number): DemoPackReadingSeed {
  return {
    intervalDurationMs: index === 0 ? 0 : 24 * 60 * 60 * 1000,
    intervalGrowthFactor: index === 0 ? 1 : 1.3,
    lastHandledAt: { dayOffset: 0 },
    nextAt: { dayOffset: index },
    priority: index,
    readingPosition: 0,
    repetitionCount: index === 0 ? 0 : 1,
    state: 'active'
  };
}

export function createDemoReviewScheduleSeed(reviewItemId: string, dueDayOffset: number): DemoPackReviewScheduleSeed {
  return {
    reviewItemId,
    due: { dayOffset: dueDayOffset },
    lastReviewAt: null,
    state: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0
  };
}
