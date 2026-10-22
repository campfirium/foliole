import { expect, it } from 'vitest';

import { compareFramedSyncDatabaseInventories } from './framedSyncDatabaseDifference.js';
import type { FramedSyncInventoryDifference, FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { deliverRequestSyncDatabaseDifferences, runRequestSyncDatabaseRound } from './requestSyncDatabaseRound.js';

const entry = (globalId: string): FramedSyncInventoryEntry => ({ globalId, objectType: 'node',
  frontierFactIds: [`${globalId}-v1`], requiredRelationIds: [], reviewFactIds: [], resourceHashes: [],
  sharedStateHash: new Uint8Array(32).fill(1) });

it.each(['node_version_cross_object_parent:lost', 'node_version_graph_cycle',
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
    transferObjects: async differences => differences.map(difference => {
      if (difference.globalId === 'bad') return outcome(difference, `framed_sync_http_400:${failure}`);
      remote.push(difference.sourceSnapshot);
      return outcome(difference);
    }),
    reportObjectError: difference => { errors.push(difference.globalId); }
  });
  expect(result).toEqual({ complete: false, pending: 1, transferred: 1, madeProgress: true });
  expect(remote.map(value => value.globalId)).toEqual(['good']);
  expect(new Set(errors)).toEqual(new Set(['bad']));
  expect(requests).toBe(3);
});

it('ends a cancelled round before transferring the next object', async () => {
  const controller = new AbortController();
  const transferred: string[] = [];
  await expect(runRequestSyncDatabaseRound({
    exchangeInventory: async () => ({ local: [entry('first'), entry('second')], remote: [] }),
    transferObjects: async differences => {
      return differences.map(difference => {
        controller.signal.throwIfAborted();
        transferred.push(difference.globalId);
        controller.abort(new Error('request_cancelled'));
        return outcome(difference);
      });
    },
    reportObjectError: () => { throw new Error('unexpected_object_error'); }
  }, controller.signal)).rejects.toThrow('request_cancelled');
  expect(transferred).toEqual(['first']);
});


it('yields to the next scheduled round when edits keep changing the inventory', async () => {
  let revision = 0;
  let transferred = 0;
  const result = await runRequestSyncDatabaseRound({
    exchangeInventory: async () => ({ local: [entry(`edit-${revision++}`)], remote: [] }),
    transferObjects: async differences => differences.map(difference => {
      transferred++;
      return outcome(difference);
    }),
    reportObjectError: () => { throw new Error('unexpected_error'); }
  });
  expect(result.complete).toBe(false);
  expect(result.pending).toBe(1);
  expect(transferred).toBeGreaterThan(0);
  expect(transferred).toBeLessThanOrEqual(4);
});

function outcome(difference: FramedSyncInventoryDifference, error = '') {
  return { requestId: new Uint8Array(16), objectType: difference.objectType, globalId: difference.globalId, error };
}

it.each([
  ['framed_sync_source_changed', false],
  ['framed_sync_difference_request_source_changed', false],
  ['framed_sync_source_changed', true],
  ['framed_sync_difference_request_source_changed', true]
] as const)('defers %s without blocking healthy work, dependent child=%s', async (failure, withChild) => {
  const local = (withChild ? ['a-child', 'b-parent', 'c-healthy'] : ['b-parent', 'c-healthy']).map(entry);
  const accepted = new Map<string, FramedSyncInventoryEntry>();
  let inventories = 0;
  let transfers = 0;
  const result = await runRequestSyncDatabaseRound({
    exchangeInventory: async () => {
      if (++inventories > 3) throw new Error('unchanged_inventory_repeated');
      return { local, remote: [...accepted.values()] };
    },
    transferObjects: async differences => {
      if (++transfers > 4) throw new Error('unchanged_source_retried');
      return differences.map(difference => {
        if (difference.globalId === 'a-child') return outcome(difference, 'framed_sync_node_parent_missing:b-parent');
        if (difference.globalId === 'b-parent') return outcome(difference, `framed_sync_http_400:${failure}`);
        accepted.set(difference.globalId, difference.sourceSnapshot);
        return outcome(difference);
      });
    },
    reportObjectError: () => { throw new Error('source_change_reported_as_invalid_object'); }
  });
  expect(result).toEqual({ complete: false, pending: withChild ? 2 : 1, transferred: 1, madeProgress: true });
  expect([...accepted.keys()]).toEqual(['c-healthy']);
  expect(inventories).toBe(3);
  expect(transfers).toBeLessThanOrEqual(4);
});

it.each([false, true])('rechecks cached child state failure after child recovery, persistent failure=%s', async persistent => {
  const inventories = { local: [entry('a-child'), entry('z-parent'),
    { ...entry('position'), objectType: 'node_open_state' as const }], remote: [] };
  const accepted = new Set<string>();
  let positionAttempts = 0;
  const result = await deliverRequestSyncDatabaseDifferences({
    exchangeInventory: async () => inventories,
    transferObjects: async differences => differences.map(difference => {
      if (difference.globalId === 'a-child' && !accepted.has('z-parent')) {
        return outcome(difference, 'framed_sync_node_parent_missing:z-parent');
      }
      if (difference.objectType === 'node_open_state') {
        positionAttempts++;
        if (persistent || !accepted.has('a-child')) return outcome(difference, 'sync_node_open_state_node_missing:a-child');
      }
      accepted.add(difference.globalId);
      return outcome(difference);
    }),
    reportObjectError: () => { throw new Error('unexpected_object_error'); }
  }, inventories, compareFramedSyncDatabaseInventories(inventories));
  expect(positionAttempts).toBe(2);
  expect(result.deferred.map(difference => difference.globalId)).toEqual(persistent ? ['position'] : []);
  expect(accepted.has('position')).toBe(!persistent);
});

it('retries a missing dependency after its batched parent succeeds and isolates a broken graph', async () => {
  const local = ['a-child', 'b-parent', 'c-broken', 'd-healthy'].map(entry);
  const accepted = new Map<string, FramedSyncInventoryEntry>();
  const calls: string[][] = [];
  const errors: string[] = [];
  const result = await runRequestSyncDatabaseRound({
    exchangeInventory: async () => ({ local, remote: [...accepted.values()].sort((a, b) => a.globalId.localeCompare(b.globalId)) }),
    transferObjects: async differences => {
      calls.push(differences.map(difference => difference.globalId));
      return differences.map(difference => {
        if (difference.globalId === 'c-broken') return outcome(difference, 'node_version_graph_cycle');
        if (difference.globalId === 'a-child' && !accepted.has('b-parent')) {
          return outcome(difference, 'framed_sync_node_parent_missing:b-parent');
        }
        accepted.set(difference.globalId, difference.sourceSnapshot);
        return outcome(difference);
      });
    },
    reportObjectError: difference => { errors.push(difference.globalId); }
  });
  expect(result).toEqual({ complete: false, pending: 1, transferred: 3, madeProgress: true });
  expect([...accepted.keys()].sort()).toEqual(['a-child', 'b-parent', 'd-healthy']);
  expect(calls[0]).toEqual(['a-child', 'b-parent', 'c-broken', 'd-healthy']);
  expect(calls).toContainEqual(['a-child']);
  expect(calls.filter(batch => batch.includes('b-parent'))).toHaveLength(1);
  expect(new Set(errors)).toEqual(new Set(['c-broken']));
});

it('does not count accepted transfers as progress when inventories remain unchanged', async () => {
  const result = await runRequestSyncDatabaseRound({
    exchangeInventory: async () => ({ local: [entry('unchanged')], remote: [] }),
    transferObjects: async differences => differences.map(difference => outcome(difference)),
    reportObjectError: () => { throw new Error('unexpected_error'); }
  });
  expect(result).toEqual({ complete: false, pending: 1, transferred: 1, madeProgress: false });
});


it.each([
  [2, 2, 2, 2, 2],
  [2, 1, 2, 1, 2],
  [2, 3, 3, 3, 3]
])('does not count changing inventories without a net reduction as progress: %j', async (...counts) => {
  let exchange = 0;
  const result = await runRequestSyncDatabaseRound({
    exchangeInventory: async () => {
      const revision = exchange++;
      return { local: Array.from({ length: counts[revision] ?? 0 }, (_, index) => entry(`${revision}-${index}`)), remote: [] };
    },
    transferObjects: async differences => differences.map(difference => outcome(difference)),
    reportObjectError: () => { throw new Error('unexpected_error'); }
  });
  expect(result.transferred).toBeGreaterThan(0);
  expect(result.pending).toBe(counts.at(-1));
  expect(result.madeProgress).toBe(false);
});
