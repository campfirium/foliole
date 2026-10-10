import { expect, it } from 'vitest';

import { compareFramedSyncDatabaseInventories } from './framedSyncDatabaseDifference.js';
import { compareFramedSyncInventories, revalidateFramedSyncInventorySource } from './framedSyncInventory.js';

const source = { globalId: 'article', objectType: 'node', frontierFactIds: ['v1'],
  requiredRelationIds: ['edge'], reviewFactIds: ['review'], stateFactIds: ['state'],
  sharedStateHash: new Uint8Array(32).fill(1), resourceHashes: [new Uint8Array(32).fill(2)] };

it('finishes unchanged database facts with a missing file while preserving the independent resource difference', () => {
  const inventories = { local: [source], remote: [{ ...source, resourceHashes: [] }] };
  expect(compareFramedSyncDatabaseInventories(inventories)).toEqual([]);
  expect(compareFramedSyncInventories(inventories)).toMatchObject([
    { direction: 'local_to_remote', need: { resourceHashes: source.resourceHashes } }
  ]);
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

it('ends node database comparison at an equal complete state hash', () => {
  const remote = { ...source, frontierFactIds: [], requiredRelationIds: [], reviewFactIds: [], stateFactIds: [] };
  expect(compareFramedSyncDatabaseInventories({ local: [source], remote: [remote] })).toEqual([]);
});
