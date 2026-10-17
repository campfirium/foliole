import { expect, it } from 'vitest';

import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { runRequestSyncDatabaseRound } from './requestSyncDatabaseRound.js';

const entry = (id: string): FramedSyncInventoryEntry => ({ objectType: 'node', globalId: id,
  frontierFactIds: [`${id}-v1`], requiredRelationIds: [], reviewFactIds: [], resourceHashes: [],
  sharedStateHash: new Uint8Array(32).fill(1) });

it.each([false, true])('rechecks an empty comparison with deferred inventory, resolves=%s', async resolves => {
  let exchanges = 0;
  const result = await runRequestSyncDatabaseRound({
    exchangeInventory: async () => ({ local: [], remote: [],
      inventoryDeferred: ++exchanges > 1 && resolves ? 0 : 1 }),
    transferObjects: async () => { throw new Error('unexpected_transfer'); },
    reportObjectError: () => { throw new Error('unexpected_error'); }
  });
  expect(result.complete).toBe(resolves);
  expect(result.pending).toBe(resolves ? 0 : 1);
  expect(result.dynamicBacklog).toBeUndefined();
  expect(exchanges).toBe(resolves ? 2 : 5);
});

it.each([
  { changes: true, commit: true, expected: true },
  { changes: true, commit: false, expected: undefined },
  { changes: false, commit: true, expected: undefined }
])('requires source deferral and confirmed commits for dynamic continuation: $changes / $commit', async ({ changes, commit, expected }) => {
  const source = [entry('hot'), entry('initial')];
  const received: FramedSyncInventoryEntry[] = [];
  let revision = 0;
  const result = await runRequestSyncDatabaseRound({
    exchangeInventory: async () => ({ local: [...source].sort((a, b) => a.globalId.localeCompare(b.globalId)),
      remote: [...received].sort((a, b) => a.globalId.localeCompare(b.globalId)) }),
    transferObjects: async differences => differences.map(difference => {
      const error = changes && difference.globalId === 'hot' ? 'framed_sync_source_changed' : '';
      if (!error) {
        if (commit) received.push(difference.sourceSnapshot);
        source.push(entry(`new-${++revision}`));
      }
      return { objectType: difference.objectType, globalId: difference.globalId, requestId: new Uint8Array(16), error };
    }),
    reportObjectError: () => { throw new Error('unexpected_error'); }
  });
  expect(result.complete).toBe(false);
  expect(result.madeProgress).toBe(false);
  expect(result.dynamicBacklog).toBe(expected);
});
