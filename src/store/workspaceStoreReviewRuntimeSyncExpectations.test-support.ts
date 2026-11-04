import { expect } from 'vitest';

import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, getReviewSchedulerVersion } from '../../lib/core/review/settings';

import { syncReviewGradeToRuntime } from './workspaceRuntimeSync';

function expectedReviewRuntimeSync(reviewedAt: string, scheduledDue: string) {
  return {
    nodeId: 'qa-1',
    grade: 3,
    reviewedAt,
    schedulerVersion: getReviewSchedulerVersion(DEFAULT_REVIEW_SCHEDULER_SETTINGS),
    cardBefore: {
      due: reviewedAt,
      last_review: null,
      state: 0,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0
    },
    cardAfter: {
      due: scheduledDue,
      last_review: reviewedAt,
      state: 1,
      stability: 3,
      difficulty: 4,
      elapsed_days: 1,
      scheduled_days: 7,
      reps: 1,
      lapses: 0
    }
  };
}

export function expectReviewRuntimeSyncCalled(reviewedAt: string, scheduledDue: string) {
  expect(syncReviewGradeToRuntime).toHaveBeenCalledTimes(1);
  expect(syncReviewGradeToRuntime).toHaveBeenCalledWith({ ...expectedReviewRuntimeSync(reviewedAt, scheduledDue), opId: expect.any(String) });
}
