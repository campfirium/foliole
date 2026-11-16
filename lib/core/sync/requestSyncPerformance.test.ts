import { afterEach, expect, it } from 'vitest';

import {
  finishRequestSyncPerformance, requestSyncPerformance, startRequestSyncPerformance
} from './requestSyncPerformance.js';

afterEach(() => { finishRequestSyncPerformance('cancelled'); });

it('distinguishes overlapping time, repeated work, and late completion without exposing keys', () => {
  let now = 0;
  startRequestSyncPerformance(() => now);
  const active = requestSyncPerformance!;
  const first = active.begin('receive_apply');
  now = 4;
  const second = active.begin('receive_apply');
  const late = active.begin('review_projection');
  active.pull('node', 'private-id', 'adoption');
  active.pull('node', 'private-id', 'followup');
  active.pull('review', 'private-id');
  active.review('private-id');
  active.review('private-id');
  now = 10;
  first();
  now = 12;
  second();
  const report = finishRequestSyncPerformance('partial');
  expect(report).toMatchObject({ elapsedMs: 12,
    phases: { receive_apply: { started: 2, finished: 2, elapsedMsSum: 18, spanMs: 12 },
      review_projection: { started: 1, finished: 0, elapsedMsSum: 0, spanMs: 0 } },
    counts: { pullAttempts: 3, repeatedPulls: 1, reviewProjections: 2, repeatedReviewProjections: 1 } });
  expect(JSON.stringify(report)).not.toContain('private-id');
  expect(report?.receiveStages.followup).toMatchObject({ nodeAttempts: 1, repeatedAttempts: 1, repeatedFromAdoption: 1 });
  startRequestSyncPerformance(() => now);
  now = 14;
  late();
  expect(finishRequestSyncPerformance('complete')).toMatchObject({ phases: {}, elapsedMs: 2 });
});
