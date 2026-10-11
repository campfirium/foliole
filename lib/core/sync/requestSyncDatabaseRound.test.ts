import { expect, it } from 'vitest';

import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { runRequestSyncDatabaseRound } from './requestSyncDatabaseRound.js';

const entry = (globalId: string): FramedSyncInventoryEntry => ({ globalId, objectType: 'node',
  frontierFactIds: [`${globalId}-v1`], requiredRelationIds: [], reviewFactIds: [], resourceHashes: [],
  sharedStateHash: new Uint8Array(32).fill(1) });

it.each(['node_version_missing_parents:lost', 'node_version_graph_cycle',
  'node_version_parent_identity_mismatch:v1'])('finishes healthy objects while isolating %s', async failure => {
  const local = [entry('bad'), entry('good')];
  const remote: FramedSyncInventoryEntry[] = [];
  const errors: string[] = [];
  let requests = 0;
  const result = await runRequestSyncDatabaseRound({
    exchangeInventory: async () => {
      if (++requests > 3) throw new Error('unchanged_inventory_repeated');
      return { local, remote: [...remote], roundId: new Uint8Array(16).fill(requests) };
    },
    transferObject: async difference => {
      if (difference.globalId === 'bad') throw new Error(`framed_sync_http_400:${failure}`);
      remote.push(difference.sourceSnapshot);
    },
    reportObjectError: difference => { errors.push(difference.globalId); }
  });
  expect(result).toEqual({ complete: false, pending: 1, transferred: 1 });
  expect(remote.map(value => value.globalId)).toEqual(['good']);
  expect(new Set(errors)).toEqual(new Set(['bad']));
  expect(requests).toBe(3);
});

it('ends a cancelled round before transferring the next object', async () => {
  const controller = new AbortController();
  const transferred: string[] = [];
  await expect(runRequestSyncDatabaseRound({
    exchangeInventory: async () => ({ local: [entry('first'), entry('second')], remote: [] }),
    transferObject: async difference => {
      transferred.push(difference.globalId);
      controller.abort(new Error('request_cancelled'));
    },
    reportObjectError: () => { throw new Error('unexpected_object_error'); }
  }, controller.signal)).rejects.toThrow('request_cancelled');
  expect(transferred).toEqual(['first']);
});
