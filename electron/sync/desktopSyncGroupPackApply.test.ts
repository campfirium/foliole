import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';

import { collectSyncPackAppliedEvent } from './desktopSyncGroupPackApply.js';

it('reports applied pack identities so the renderer reloads committed sync facts', async () => {
  const query = vi.fn()
    .mockResolvedValueOnce([{ id: 'node-a' }, { id: 'node-a' }, { id: 'node-b' }])
    .mockResolvedValueOnce([
      { object_id: 'node-a', object_type: 'node_reading' },
      { object_id: 'node-a', object_type: 'node_reading' },
      { object_id: 'attachment-a', object_type: 'attachment' }
    ]);

  await expect(collectSyncPackAppliedEvent({ query } as unknown as DbPort, {
    applied: true, appliedBlobCount: 1, appliedGroupFactCount: 3,
    appliedObjectCount: 4, appliedReviewOpIds: ['review-a'],
    fromStateSeq: 0, handledConflictCount: 0, toStateSeq: 4
  })).resolves.toEqual({
    appliedNodeIds: ['node-a', 'node-b'],
    appliedObjectIds: ['node_reading:node-a', 'attachment:attachment-a'],
    appliedReviewOpIds: ['review-a']
  });
});

it('does not report a replayed pack as a new workspace change', async () => {
  const query = vi.fn();
  await expect(collectSyncPackAppliedEvent({ query } as unknown as DbPort, {
    applied: false, appliedBlobCount: 0, appliedGroupFactCount: 0,
    appliedObjectCount: 0, appliedReviewOpIds: [],
    fromStateSeq: 4, handledConflictCount: 0, toStateSeq: 4
  })).resolves.toEqual({ appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] });
  expect(query).not.toHaveBeenCalled();
});
