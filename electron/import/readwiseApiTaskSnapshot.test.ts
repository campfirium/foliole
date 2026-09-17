import { expect, it } from 'vitest';

import { buildReadwiseApiTaskSnapshot } from './readwiseApiTaskSnapshot.js';

it('keeps a completed cutover complete while an ordinary index is pending', () => {
  const snapshot = buildReadwiseApiTaskSnapshot({
    candidateProgress: null,
    completedThrough: '2026-09-10T00:00:00.000Z',
    cutover: {
      completedAt: '2026-09-09T00:00:00.000Z',
      completedCandidateCount: 68,
      migratedCount: 44,
      sourceHost: 'Mac',
      startedAt: '2026-09-08T00:00:00.000Z',
      status: 'api',
      totalCandidateCount: 68,
      unmatchedCount: 24,
      version: 1
    },
    eligibility: 'ready',
    initialProgress: null,
    lastResult: null,
    lifecycle: null,
    migrationPending: true,
    nextRunAt: null,
    workerOwned: false
  });

  expect(snapshot.cutover.status).toBe('completed');
  expect(snapshot.initial_sync.status).toBe('completed');
});
