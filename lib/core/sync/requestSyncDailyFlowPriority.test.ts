import { expect, it } from 'vitest';

import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { runRequestSyncDatabaseRound } from './requestSyncDatabaseRound.js';

const node = (globalId: string): FramedSyncInventoryEntry => ({ globalId, objectType: 'node',
  frontierFactIds: ['version'], requiredRelationIds: [], reviewFactIds: [], resourceHashes: [], sharedStateHash: new Uint8Array(32).fill(1) });
const flow = (): FramedSyncInventoryEntry => ({ ...node('list'), objectType: 'daily_flow',
  frontierFactIds: [], stateFactIds: ['daily_flow:hash'], dailyFlowRootId: 'list', dailyFlowCurrent: true,
  dailyFlowComplete: true, dailyFlowNodeIds: ['needed'] });

it('installs the list after its required nodes and before unrelated work in either direction', async () => {
  const local = [node('unrelated-local')];
  const remote = [flow(), node('needed'), node('unrelated-remote')];
  const order: string[] = [];
  const result = await runRequestSyncDatabaseRound({
    exchangeInventory: async () => ({ local: [...local].sort(compare), remote: [...remote].sort(compare) }),
    transferObjects: async differences => differences.map(difference => {
      order.push(difference.globalId);
      if (difference.globalId === 'list') expect(local.some(entry => entry.globalId === 'needed')).toBe(true);
      if (difference.globalId.startsWith('unrelated')) expect(local.some(entry => entry.globalId === 'list')).toBe(true);
      (difference.direction === 'remote_to_local' ? local : remote).push(difference.sourceSnapshot);
      return { globalId: difference.globalId, objectType: difference.objectType, requestId: new Uint8Array(16), error: '' };
    }),
    reportObjectError: () => { throw new Error('unexpected_error'); }
  });
  expect(result.complete).toBe(true);
  expect(order.slice(0, 2)).toEqual(['needed', 'list']);
});

it('prioritizes missing learning data for an already complete list without sending the list again', async () => {
  const root = flow();
  const local = [root];
  const remote = [root, node('needed'), node('a-unrelated')];
  const order: string[] = [];
  const result = await runRequestSyncDatabaseRound({
    exchangeInventory: async () => ({ local: [...local].sort(compare), remote: [...remote].sort(compare) }),
    transferObjects: async differences => differences.map(difference => {
      order.push(difference.globalId); local.push(difference.sourceSnapshot);
      return { globalId: difference.globalId, objectType: difference.objectType, requestId: new Uint8Array(16), error: '' };
    }), reportObjectError: () => undefined
  });
  expect(result.complete).toBe(true);
  expect(order).toEqual(['needed', 'a-unrelated']);
});

function compare(a: FramedSyncInventoryEntry, b: FramedSyncInventoryEntry) {
  return a.objectType.localeCompare(b.objectType) || a.globalId.localeCompare(b.globalId);
}

it('continues healthy unrelated work when a priority object cannot currently be delivered', async () => {
  const local = [flow(), node('needed'), node('unrelated')];
  const remote: FramedSyncInventoryEntry[] = [];
  const result = await runRequestSyncDatabaseRound({
    exchangeInventory: async () => ({ local: [...local].sort(compare), remote: [...remote].sort(compare) }),
    transferObjects: async differences => differences.map(item => {
      const error = item.objectType === 'daily_flow' ? 'framed_sync_source_changed' : '';
      if (!error && !remote.some(entry => entry.globalId === item.globalId)) remote.push(item.sourceSnapshot);
      return { globalId: item.globalId, objectType: item.objectType, requestId: new Uint8Array(16), error };
    }), reportObjectError: () => undefined
  });
  expect(result.pending).toBe(1);
  expect(remote.some(entry => entry.globalId === 'unrelated')).toBe(true);
});
