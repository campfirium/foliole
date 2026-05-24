import { vi } from 'vitest';

const reviewSchedulerSettingsMocks = vi.hoisted(() => {
  const baseSettings = {
    algorithm: 'ts-fsrs@4.3.0',
    desiredRetention: 0.9,
    maximumIntervalDays: 36500,
    newDayStartsAtHour: 4,
    enableShortTerm: false,
    pushQueue: {
      defaultPriority: 5,
      priorityRatio: 5,
      queueMixRatio: { reading: 1, fsrs: 5 },
      readingInitialIntervalMs: 24 * 60 * 60 * 1000,
      readingIntervalGrowthFactorRange: { min: 1.1, max: 1.5 }
    },
    updatedAt: '2026-03-06T00:00:00.000Z'
  };
  return {
    loadReviewSchedulerSettings: vi.fn().mockReturnValue(baseSettings),
    saveReviewSchedulerSettings: vi.fn().mockReturnValue({
      ...baseSettings,
      desiredRetention: 0.8,
      maximumIntervalDays: 180,
      newDayStartsAtHour: 6,
      enableShortTerm: true,
      pushQueue: {
        ...baseSettings.pushQueue,
        priorityRatio: 7,
        queueMixRatio: { reading: 2, fsrs: 4 },
        readingIntervalGrowthFactorRange: { min: 1.08, max: 1.42 }
      },
      updatedAt: '2026-03-06T00:05:00.000Z'
    })
  };
});

vi.mock('../reviewSchedulerSettings.js', () => reviewSchedulerSettingsMocks);
