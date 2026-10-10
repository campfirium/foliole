import { expect, it } from 'vitest';

import {
  classifyFramedSyncInventoryRound,
  compareFramedSyncInventories,
  revalidateFramedSyncInventorySource,
  type FramedSyncInventoryEntry
} from './framedSyncInventory.js';

function hash(byte: number) {
  return new Uint8Array(32).fill(byte);
}

function entry(globalId: string, overrides: Partial<FramedSyncInventoryEntry> = {}):
FramedSyncInventoryEntry {
  return {
    frontierFactIds: [],
    globalId,
    objectType: 'node',
    requiredRelationIds: [],
    resourceHashes: [],
    reviewFactIds: [],
    sharedStateHash: hash(1),
    ...overrides
  };
}

function view(difference: ReturnType<typeof compareFramedSyncInventories>[number]) {
  return {
    direction: difference.direction,
    frontier: difference.need.frontierFactIds,
    relations: difference.need.requiredRelationIds,
    resources: difference.need.resourceHashes.map((value) => value[0]),
    reviews: difference.need.reviewFactIds,
    sharedState: difference.need.sharedState
  };
}

it('ends the node comparison at equal hashes and preserves independent resources', () => {
  const local = entry('shared', {
    frontierFactIds: ['frontier-common', 'frontier-local'],
    requiredRelationIds: ['relation-local'],
    resourceHashes: [hash(4)],
    reviewFactIds: ['review-common']
  });
  const remote = entry('shared', {
    frontierFactIds: ['frontier-common'],
    requiredRelationIds: ['relation-remote'],
    resourceHashes: [hash(5)],
    reviewFactIds: ['review-common', 'review-remote']
  });

  expect(compareFramedSyncInventories({ local: [local], remote: [remote] }).map(view)).toEqual([
    {
      direction: 'local_to_remote', frontier: [],
      relations: [], resources: [4], reviews: [], sharedState: false
    },
    {
      direction: 'remote_to_local', frontier: [], relations: [],
      resources: [5], reviews: [], sharedState: false
    }
  ]);
});

it('emits complete directional needs for absent and divergent objects', () => {
  const localOnly = entry('a', {
    frontierFactIds: ['frontier-a'], resourceHashes: [hash(7)]
  });
  const localChanged = entry('b', { sharedStateHash: hash(2) });
  const remoteChanged = entry('b', { sharedStateHash: hash(3) });
  const remoteOnly = entry('c', { reviewFactIds: ['review-c'] });

  const result = compareFramedSyncInventories({
    local: [localOnly, localChanged], remote: [remoteChanged, remoteOnly]
  });

  expect(result.map((difference) => [
    difference.globalId, difference.direction, difference.need.sharedState
  ])).toEqual([
    ['a', 'local_to_remote', true],
    ['b', 'local_to_remote', true],
    ['b', 'remote_to_local', true],
    ['c', 'remote_to_local', true]
  ]);
  expect(result[0]?.need.frontierFactIds).toEqual(['frontier-a']);
  expect(result[3]?.need.reviewFactIds).toEqual(['review-c']);
});

it('defers only the direction whose source changed after the fixed inventory', () => {
  const frozenLocal = entry('a', { sharedStateHash: hash(2) });
  const frozenRemote = entry('a', { sharedStateHash: hash(3) });
  const differences = compareFramedSyncInventories({
    local: [frozenLocal], remote: [frozenRemote]
  });

  const localResult = revalidateFramedSyncInventorySource({
    currentSource: [entry('a', { sharedStateHash: hash(4) }), entry('new-after-snapshot')],
    direction: 'local_to_remote',
    differences
  });
  const remoteResult = revalidateFramedSyncInventorySource({
    currentSource: [frozenRemote], direction: 'remote_to_local', differences
  });

  expect(remoteResult.readyDifferences.map((difference) => difference.direction))
    .toEqual(['remote_to_local']);
  expect(localResult.readyDifferences).toEqual([]);
  expect(localResult.deferredObjects).toEqual([{ globalId: 'a', objectType: 'node' }]);
  expect(classifyFramedSyncInventoryRound({
    deferredObjects: localResult.deferredObjects,
    outstandingDifferences: remoteResult.readyDifferences
  })).toBe('pending');
  expect(classifyFramedSyncInventoryRound({
    deferredObjects: localResult.deferredObjects,
    outstandingDifferences: []
  })).toBe('drained');
});

it('treats reordered independent fact sets as the same frozen source', () => {
  const local = entry('a', {
    frontierFactIds: ['frontier-1', 'frontier-2'],
    resourceHashes: [hash(4), hash(5)]
  });
  const differences = compareFramedSyncInventories({ local: [local], remote: [] });
  const currentLocal = entry('a', {
    frontierFactIds: ['frontier-2', 'frontier-1'],
    resourceHashes: [hash(5), hash(4)]
  });

  expect(revalidateFramedSyncInventorySource({
    currentSource: [currentLocal], direction: 'local_to_remote', differences
  })).toEqual({ deferredObjects: [], readyDifferences: differences });
});

it('marks an empty fixed snapshot round converged without absorbing later objects', () => {
  const differences = compareFramedSyncInventories({ local: [], remote: [] });
  const result = revalidateFramedSyncInventorySource({
    currentSource: [entry('created-after-snapshot')],
    direction: 'local_to_remote', differences
  });

  expect(result).toEqual({ deferredObjects: [], readyDifferences: [] });
  expect(classifyFramedSyncInventoryRound({
    deferredObjects: result.deferredObjects,
    outstandingDifferences: result.readyDifferences
  })).toBe('converged');
});

it('rejects inventories that are not in stable object and global ID order', () => {
  expect(() => compareFramedSyncInventories({
    local: [entry('b'), entry('a')], remote: []
  })).toThrow('framed_sync_inventory_order_invalid');
});
