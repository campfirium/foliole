import { expect, it } from 'vitest';

import { compareFramedSyncDatabaseInventories } from './framedSyncDatabaseDifference.js';
import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { createFramedSyncInventoryDependencyLookup } from './framedSyncInventoryDependencyLookup.js';
import { deliverFramedSyncDifferencesInDependencyOrder } from './framedSyncInventoryRoundDelivery.js';

function entry(globalId: string, objectType = 'node'): FramedSyncInventoryEntry {
  return { globalId, objectType, sharedStateHash: new Uint8Array(32).fill(1),
    frontierFactIds: [], requiredRelationIds: [], resourceHashes: [], reviewFactIds: [], stateFactIds: ['fact'] };
}

it.each(['local_to_remote', 'remote_to_local'] as const)('finds fixed %s dependencies outside the current window', async direction => {
  const source = [entry('child'), entry('independent'), entry('parent')];
  const inventories = direction === 'local_to_remote' ? { local: source, remote: [] } : { local: [], remote: source };
  const differences = compareFramedSyncDatabaseInventories(inventories);
  const lookup = createFramedSyncInventoryDependencyLookup(inventories);
  for (const difference of differences) expect(lookup(difference)).toEqual(difference);
  const calls: string[] = [];
  await expect(deliverFramedSyncDifferencesInDependencyOrder(differences.slice(0, 2), async difference => {
    calls.push(difference.globalId);
    if (difference.globalId === 'child' && !calls.includes('parent')) {
      throw new Error('framed_sync_node_parent_missing:parent');
    }
    return 'delivered';
  }, lookup)).resolves.toEqual([]);
  expect(calls).toEqual(['child', 'parent', 'child', 'independent']);
  expect(lookup({ direction, globalId: 'absent', objectType: 'node' })).toBeUndefined();
});

it('offers equal arrangement identities for missing bodies without resending equal node state', () => {
  const shared = [entry('node'), entry('order', 'order_version')];
  const lookup = createFramedSyncInventoryDependencyLookup({ local: shared, remote: shared });
  expect(lookup({ direction: 'local_to_remote', globalId: 'node', objectType: 'node' })).toBeUndefined();
  expect(lookup({ direction: 'local_to_remote', globalId: 'order', objectType: 'order_version' }))
    .toMatchObject({ need: { sharedState: true, stateFactIds: ['fact'] }, sourceSnapshot: shared[1] });
});
