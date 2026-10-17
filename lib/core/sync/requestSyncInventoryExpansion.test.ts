import { expect, it } from 'vitest';

import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { mergeRequestSyncNodeDetails } from './requestSyncInventoryExpansion.js';

const entry = (globalId: string): FramedSyncInventoryEntry => ({
  objectType: 'node', globalId, sharedStateHash: new Uint8Array(32), frontierFactIds: ['v1'],
  currentVersionId: 'v1', requiredRelationIds: [], reviewFactIds: [], resourceHashes: []
});

it('retains a missing known identity as deferred while accepting later details', () => {
  const deferred = new Set<string>();
  const later = { ...entry('changed'), currentVersionId: 'v2', frontierFactIds: ['v1', 'v2'] };
  expect(mergeRequestSyncNodeDetails([entry('missing'), entry('changed')],
    ['missing', 'changed'], [later], deferred)).toEqual([later]);
  expect([...deferred]).toEqual(['missing']);
  mergeRequestSyncNodeDetails([], ['missing'], [], deferred);
  expect(deferred.size).toBe(1);
});

it('accepts a newly appeared requested identity without inventing a missing one', () => {
  const deferred = new Set<string>();
  expect(mergeRequestSyncNodeDetails([], ['new', 'absent'], [entry('new')], deferred)).toEqual([entry('new')]);
  expect(deferred.size).toBe(0);
});

it.each([{ details: [entry('foreign')] }, { details: [entry('known'), entry('known')] }])('rejects invalid detail identities', ({ details }) => {
  expect(() => mergeRequestSyncNodeDetails([entry('known')], ['known'], details, new Set()))
    .toThrow('inventory_node_detail_identity_invalid');
});
