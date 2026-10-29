import { expect, it } from 'vitest';

import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { runRequestSyncDatabaseRound } from './requestSyncDatabaseRound.js';

const entry = (globalId = 'note'): FramedSyncInventoryEntry => ({ globalId, objectType: 'node',
  frontierFactIds: ['version'], requiredRelationIds: [], reviewFactIds: [], resourceHashes: [],
  sharedStateHash: new Uint8Array(32).fill(1) });
const outcome = (item: { globalId: string; objectType: string }) => ({ ...item, requestId: new Uint8Array(16), error: '' });

it('analyzes the initial inventory once before delivering its work', async () => {
  let reads = 0;
  const note = { ...entry(), get sharedStateHash() { reads++; return new Uint8Array(32).fill(1); } };
  let accepted = false;
  const result = await runRequestSyncDatabaseRound({
    exchangeInventory: async () => ({ local: [note], remote: accepted ? [entry()] : [] }),
    transferObjects: async differences => {
      // One validation and two source snapshot reads; counting pending must reuse this analysis.
      expect(reads).toBeLessThanOrEqual(3);
      accepted = true;
      return differences.map(outcome);
    }, reportObjectError: () => undefined
  });
  expect(result).toMatchObject({ complete: true, pending: 0, transferred: 1 });
});

it('reuses the final analysis for completion without serializing inventory entries', async () => {
  const note = { ...entry(), toJSON() { throw new Error('inventory_serialized'); } };
  let reads = 0;
  let accepted = false;
  const final = { ...entry(), get sharedStateHash() { reads++; return new Uint8Array(32).fill(1); } };
  const result = await runRequestSyncDatabaseRound({
    exchangeInventory: async () => ({ local: accepted ? [final] : [note], remote: accepted ? [note] : [] }),
    transferObjects: async differences => { accepted = true; return differences.map(outcome); },
    reportObjectError: () => undefined
  });
  expect(result.complete).toBe(true);
  // One validation and both directions; at most one comparison to the previous snapshot.
  expect(reads).toBeLessThanOrEqual(4);
});

it('analyzes an already converged inventory once before completing', async () => {
  let reads = 0;
  const note = { ...entry(), get sharedStateHash() { reads++; return new Uint8Array(32).fill(1); } };
  const result = await runRequestSyncDatabaseRound({
    exchangeInventory: async () => ({ local: [note], remote: [entry()] }),
    transferObjects: async () => { throw new Error('equal_inventory_transferred'); }, reportObjectError: () => undefined
  });
  expect(result).toMatchObject({ complete: true, pending: 0, transferred: 0 });
  expect(reads).toBeLessThanOrEqual(3);
});

it.each(['hash', 'identity', 'dependency', 'root'] as const)(
  'continues when pending is unchanged but %s changes', async change => {
    let exchanges = 0;
    let attempts = 0;
    const dependency = (changed: boolean) => ({ ...entry('context'), objectType: 'daily_flow',
      dailyFlowRootId: changed && change === 'root' ? 'new-root' : 'root',
      dailyFlowNodeIds: changed && change === 'dependency' ? ['note'] : [] });
    const result = await runRequestSyncDatabaseRound({
      exchangeInventory: async () => {
        const changed = exchanges++ > 0;
        const note = { ...entry(changed && change === 'identity' ? 'other' : 'note'),
          sharedStateHash: new Uint8Array(32).fill(changed && change === 'hash' ? 2 : 1) };
        return { local: [dependency(changed), note], remote: [dependency(changed)] };
      },
      transferObjects: async differences => { attempts++; return differences.map(outcome); },
      reportObjectError: () => undefined
    });
    expect(attempts).toBe(2);
    expect(exchanges).toBe(3);
    expect(result).toMatchObject({ complete: false, pending: 1, madeProgress: false });
  });

it.each([false, true])('does not complete equal unready inventories, deferred=%s', async deferred => {
  let exchanges = 0;
  const note = { ...entry(), unready: true };
  const result = await runRequestSyncDatabaseRound({
    exchangeInventory: async () => { exchanges++; return { local: [note], remote: [note], inventoryDeferred: deferred ? 1 : 0 }; },
    transferObjects: async differences => differences.map(outcome), reportObjectError: () => undefined
  });
  expect(result).toMatchObject({ complete: false, pending: deferred ? 2 : 1, madeProgress: false });
  expect(exchanges).toBe(deferred ? 5 : 1);
});
