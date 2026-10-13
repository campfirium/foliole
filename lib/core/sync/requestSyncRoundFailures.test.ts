import { expect, it, vi } from 'vitest';

import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { runRequestSyncDatabaseRound } from './requestSyncDatabaseRound.js';

const entry = (globalId: string): FramedSyncInventoryEntry => ({ globalId, objectType: 'node',
  frontierFactIds: [`${globalId}-version`], requiredRelationIds: [], reviewFactIds: [], resourceHashes: [],
  sharedStateHash: new Uint8Array(32).fill(1) });

it.each(['framed_sync_frame_body_truncated', 'request_sync_http_401', 'native_transport_failed'])(
  'propagates %s without retrying the batch or reporting completion', async failure => {
    const transferObjects = vi.fn(async () => { throw new Error(failure); });
    await expect(runRequestSyncDatabaseRound({
      exchangeInventory: async () => ({ local: [entry('first'), entry('second')], remote: [] }),
      transferObjects,
      reportObjectError: () => { throw new Error('transport_error_misclassified'); }
    })).rejects.toThrow(failure);
    expect(transferObjects).toHaveBeenCalledOnce();
  });

it.each(['missing', 'extra', 'reordered', 'duplicate'] as const)(
  'rejects %s object results instead of confirming another object', async corruption => {
    const transferObjects = vi.fn(async () => {
      const ids = { missing: ['first'], extra: ['first', 'second', 'third'],
        reordered: ['second', 'first'], duplicate: ['first', 'first'] }[corruption];
      return ids.map(globalId => ({ globalId, objectType: 'node', requestId: new Uint8Array(16), error: '' }));
    });
    await expect(runRequestSyncDatabaseRound({
      exchangeInventory: async () => ({ local: [entry('first'), entry('second')], remote: [] }),
      transferObjects,
      reportObjectError: () => { throw new Error('result_error_misclassified'); }
    })).rejects.toThrow(corruption === 'missing' || corruption === 'extra'
      ? 'request_sync_batch_results_missing' : 'request_sync_batch_identity_mismatch');
    expect(transferObjects).toHaveBeenCalledOnce();
  });
