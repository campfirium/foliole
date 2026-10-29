import { expect, it } from 'vitest';

import { revalidateFramedSyncInventorySource, type FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { analyzeRequestSyncInventories } from './requestSyncInventoryAnalysis.js';

const version = (id: string) => JSON.stringify([id, 'hash', 'hash', '2026-01-01', null, 'available', null]);
const relation = (id: string) => JSON.stringify([id, 'parent']);

const entry = (): FramedSyncInventoryEntry => ({ objectType: 'daily_flow', globalId: 'operation',
  sharedStateHash: new Uint8Array(32).fill(1), frontierFactIds: ['a', 'b'], requiredRelationIds: [relation('a'), relation('b')],
  reviewFactIds: ['a', 'b'], stateFactIds: ['a', 'b'], versionStates: [version('a'), version('b')], resourceHashes: [new Uint8Array(32).fill(2)],
  dailyFlowRootId: 'root', dailyFlowNodeIds: ['a', 'b'], dailyFlowComplete: false, dailyFlowCurrent: false,
  currentVersionId: 'version', unready: false });

const changes: Partial<FramedSyncInventoryEntry>[] = [
  { globalId: 'other' }, { objectType: 'other' }, { sharedStateHash: new Uint8Array(32).fill(2) },
  { unready: true }, { currentVersionId: 'next' }, { frontierFactIds: ['c'] }, { requiredRelationIds: [relation('c')] },
  { reviewFactIds: ['c'] }, { stateFactIds: ['c'] }, { versionStates: [version('c')] },
  { resourceHashes: [new Uint8Array(32).fill(3)] }, { dailyFlowRootId: 'other-root' },
  { dailyFlowComplete: true }, { dailyFlowCurrent: true }, { dailyFlowNodeIds: ['c'] }
];

it.each(changes)('detects a changed inventory field %j even outside transferable work', change => {
  const before = entry();
  const after = { ...before, ...change };
  // Both peers changed together, so the difference set alone carries no evidence of this change.
  const result = analyzeRequestSyncInventories({ local: [after], remote: [after] }, { local: [before], remote: [before] });
  expect(result.stateUnchanged).toBe(false);
});

it('compares collection fields as sets while retaining all inventory state', () => {
  const before = entry();
  const reordered = { ...before, frontierFactIds: ['b', 'a'], requiredRelationIds: [relation('b'), relation('a')],
    reviewFactIds: ['b', 'a'], stateFactIds: ['b', 'a'], versionStates: [version('b'), version('a')], dailyFlowNodeIds: ['b', 'a'] };
  expect(analyzeRequestSyncInventories({ local: [reordered], remote: [] }, { local: [before], remote: [] }).stateUnchanged)
    .toBe(true);
});

it('defers a selected daily operation when its root identity changed', () => {
  const before = entry();
  const difference = { objectType: before.objectType, globalId: before.globalId,
    direction: 'local_to_remote' as const, sourceSnapshot: before,
    need: { sharedState: true, frontierFactIds: [], requiredRelationIds: [], reviewFactIds: [], resourceHashes: [] } };
  const result = revalidateFramedSyncInventorySource({ currentSource: [{ ...before, dailyFlowRootId: 'new-root' }],
    direction: 'local_to_remote', differences: [difference] });
  expect(result.readyDifferences).toEqual([]);
  expect(result.deferredObjects).toEqual([{ objectType: before.objectType, globalId: before.globalId }]);
});
