import { expect, it } from 'vitest';

import { compareFramedSyncInventories, type FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { differingNodeIds, framedSyncInventorySummary } from './framedSyncInventorySummary.js';

function node(id: string, byte = 1): FramedSyncInventoryEntry {
  return { globalId: id, objectType: 'node', sharedStateHash: new Uint8Array(32).fill(byte),
    frontierFactIds: ['v1'], requiredRelationIds: [], reviewFactIds: [], resourceHashes: [] };
}

it('exchanges only node summaries and requests details only for different or unready nodes', () => {
  const a = node('a');
  const b = node('b');
  Object.defineProperty(a, 'versionStates', { get() { throw new Error('history_was_read'); } });
  const summaries = framedSyncInventorySummary([a, b]);
  expect(summaries[0]).toMatchObject({ globalId: 'a', frontierFactIds: [], resourceHashes: [] });
  expect(summaries[0]).not.toHaveProperty('versionStates');
  expect(differingNodeIds([a, b], summaries)).toEqual([]);
  expect(differingNodeIds([a, b], [summaries[0]!, { ...summaries[1]!, sharedStateHash: new Uint8Array(32).fill(2) }]))
    .toEqual(['b']);
  expect(differingNodeIds([a, { ...b, unready: true }], summaries)).toEqual(['b']);
});

it('ends equal node comparison without requesting historical versions and selects only changed bodies otherwise', () => {
  const state = (id: string, status: string) => JSON.stringify([id, 'identity', 'author', 'date', 'body', status, null]);
  const a = { ...node('a'), currentVersionId: 'v3', frontierFactIds: ['v1', 'v2', 'v3'],
    versionStates: [state('v1', 'deleted'), state('v2', 'available'), state('v3', 'available')] };
  expect(compareFramedSyncInventories({ local: [a], remote: framedSyncInventorySummary([a]) })).toEqual([]);
  const b = { ...a, sharedStateHash: new Uint8Array(32).fill(2),
    versionStates: [state('v1', 'available'), state('v2', 'missing'), state('v3', 'available')] };
  const changes = compareFramedSyncInventories({ local: [a], remote: [b] });
  expect(changes.find(change => change.direction === 'local_to_remote')!.need.frontierFactIds).toEqual(['v1', 'v2']);
  expect(changes.find(change => change.direction === 'remote_to_local')!.need.frontierFactIds).toEqual([]);
});
