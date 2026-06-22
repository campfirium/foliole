import type { DemoPackReadingSeed, DemoPackReviewScheduleSeed } from '../../src/demo/demoPack.js';

export function createDemoReadingSeed(index: number): DemoPackReadingSeed {
  void index;
  return {
    intervalDurationMs: 0,
    intervalGrowthFactor: 1,
    lastHandledAt: { dayOffset: 0 },
    nextAt: { dayOffset: 0 },
    priority: 0,
    readingPosition: 0,
    repetitionCount: 0,
    state: 'active'
  };
}

export function createDemoReviewScheduleSeed(reviewItemId: string, dueDayOffset: number): DemoPackReviewScheduleSeed {
  void dueDayOffset;
  return {
    reviewItemId,
    due: { dayOffset: 0 },
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
