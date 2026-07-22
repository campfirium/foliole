import { expect } from 'vitest';

import { syncReviewGradeToRuntime } from './workspaceRuntimeSync';

function expectedReviewRuntimeSync(reviewedAt: string, scheduledDue: string) {
  return {
    nodeId: 'qa-1',
    grade: 3,
    reviewedAt,
    schedulerVersion: 'ts-fsrs@5.4.1 using FSRS-6.0|dr=0.90|mi=36500|ds=4|st=0|pqdp=5|pqpr=5.00|pqmx=1:5|pqii=86400000|pqgr=1.10-1.50',
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
  expect(syncReviewGradeToRuntime).toHaveBeenCalledWith(expectedReviewRuntimeSync(reviewedAt, scheduledDue));
}
