import { expect, it } from 'vitest';

import { compareFramedSyncDatabaseInventories, hasFramedSyncDatabaseDifference } from './framedSyncDatabaseDifference.js';
import { compareFramedSyncInventories, revalidateFramedSyncInventorySource } from './framedSyncInventory.js';

const source = { globalId: 'article', objectType: 'node', frontierFactIds: ['v1'],
  requiredRelationIds: ['edge'], reviewFactIds: ['review'], stateFactIds: ['state'],
  sharedStateHash: new Uint8Array(32).fill(1), resourceHashes: [new Uint8Array(32).fill(2)] };

it('finishes unchanged database facts with a missing file while preserving the independent resource difference', () => {
  const inventories = { local: [source], remote: [{ ...source, resourceHashes: [] }] };
  expect(compareFramedSyncDatabaseInventories(inventories)).toEqual([]);
  expect(hasFramedSyncDatabaseDifference(inventories)).toBe(false);
  expect(compareFramedSyncInventories(inventories)).toMatchObject([
    { direction: 'local_to_remote', need: { resourceHashes: source.resourceHashes } }
  ]);
});

it.each(['local', 'remote'] as const)('ends database comparison on %s when complete state hashes match', side => {
  const complete = { ...source, globalId: 'later' };
  const missing = { ...complete, frontierFactIds: [] };
  expect(hasFramedSyncDatabaseDifference({
    local: [source, side === 'local' ? complete : missing],
    remote: [source, side === 'remote' ? complete : missing]
  })).toBe(false);
});

it('validates the entire inventory before accepting an early database difference', () => {
  expect(() => hasFramedSyncDatabaseDifference({ local: [source,
    { ...source, globalId: 'later', sharedStateHash: new Uint8Array(31) }], remote: [] }))
    .toThrow('shared_state_hash');
  expect(() => hasFramedSyncDatabaseDifference({ local: [{ ...source, globalId: 'later' }, source], remote: [] }))
    .toThrow('inventory_order_invalid');
});

it('keeps original fact duties and source revalidation when files are handled separately', () => {
  const differences = compareFramedSyncDatabaseInventories({ local: [source], remote: [] });
  expect(differences).toMatchObject([{ sourceSnapshot: source, need: {
    sharedState: true, frontierFactIds: ['v1'], requiredRelationIds: ['edge'],
    reviewFactIds: ['review'], stateFactIds: ['state'], resourceHashes: []
  } }]);
  expect(revalidateFramedSyncInventorySource({ currentSource: [source], differences, direction: 'local_to_remote' }))
    .toEqual({ readyDifferences: differences, deferredObjects: [] });
  expect(revalidateFramedSyncInventorySource({ currentSource: [{ ...source, sharedStateHash: new Uint8Array(32) }],
    differences, direction: 'local_to_remote' }).deferredObjects).toEqual([{ globalId: 'article', objectType: 'node' }]);
});
