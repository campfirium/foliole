import { expect, it, vi } from 'vitest';

import { compareFramedSyncDatabaseInventories } from './framedSyncDatabaseDifference.js';
import type { FramedSyncInventoryDifference, FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { deliverRequestSyncDatabaseDifferences } from './requestSyncDatabaseRound.js';

const entry = (globalId: string): FramedSyncInventoryEntry => ({ globalId, objectType: 'node',
  frontierFactIds: [`${globalId}-v1`], requiredRelationIds: [], reviewFactIds: [], resourceHashes: [],
  sharedStateHash: new Uint8Array(32).fill(1) });

it.each([[undefined, 12], [3000, 24]])('honors the pull target %s and yields before the next batch', async (pullTargetMs, expected) => {
  const inventory = { local: [], remote: Array.from({ length: 80 }, (_, i) => entry(`note-${String(i).padStart(2, '0')}`)) };
  const differences = compareFramedSyncDatabaseInventories(inventory);
  let now = 0;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
  const pulls: number[] = [];
  try {
    const result = await deliverRequestSyncDatabaseDifferences({
      exchangeInventory: async () => inventory,
      transferObjects: async batch => {
        pulls.push(batch.length);
        now += 125 * batch.length;
        return batch.map(item => outcome(item));
      },
      reportObjectError: () => { throw new Error('unexpected_error'); },
      ...(pullTargetMs ? { pullTargetMs } : {}),
      watchLocalChanges: () => () => pulls.length === 2
    }, inventory, differences);
    expect(result.yielded).toBe(true);
    expect(pulls).toEqual([8, expected]);
  } finally { clock.mockRestore(); }
});

function outcome(difference: FramedSyncInventoryDifference, error = '') {
  return { requestId: new Uint8Array(16), objectType: difference.objectType, globalId: difference.globalId, error };
}
