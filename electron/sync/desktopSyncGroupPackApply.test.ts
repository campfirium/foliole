import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { SOURCE_OWNERSHIP_SYNC_FEATURE } from '../../lib/platform/syncAdvertisedFeatures.js';

import { assertSourceOwnershipPackCompatible, collectSyncPackAppliedEvent } from './desktopSyncGroupPackApply.js';

it('rejects desktop packs without source ownership support before apply', () => {
  expect(() => assertSourceOwnershipPackCompatible('desktop', [])).toThrow(
    'sync_pack_source_ownership_feature_missing'
  );
  expect(() => assertSourceOwnershipPackCompatible('desktop', [SOURCE_OWNERSHIP_SYNC_FEATURE])).not.toThrow();
  expect(() => assertSourceOwnershipPackCompatible('android-capacitor', [])).not.toThrow();
});

it('reports applied pack identities so the renderer reloads committed sync facts', async () => {
  const query = vi.fn()
    .mockResolvedValueOnce([{ id: 'node-a' }, { id: 'node-a' }, { id: 'node-b' }])
    .mockResolvedValueOnce([
      { object_id: 'node-a', object_type: 'node_reading' },
      { object_id: 'node-a', object_type: 'node_reading' },
      { object_id: 'attachment-a', object_type: 'attachment' }
    ]);

  await expect(collectSyncPackAppliedEvent({ query } as unknown as DbPort, {
    applied: true, appliedBlobCount: 1, appliedObjectCount: 4, appliedReviewOpIds: ['review-a'],
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
    applied: false, appliedBlobCount: 0, appliedObjectCount: 0, appliedReviewOpIds: [],
    fromStateSeq: 4, handledConflictCount: 0, toStateSeq: 4
  })).resolves.toEqual({ appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] });
  expect(query).not.toHaveBeenCalled();
});
