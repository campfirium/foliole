import { compareFramedSyncDatabaseInventories } from './framedSyncDatabaseDifference.js';
import type { FramedSyncInventoryDifference, FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { createFramedSyncInventoryDependencyLookup } from './framedSyncInventoryDependencyLookup.js';
import { deliverFramedSyncDifferencesInDependencyOrder, readFramedSyncMissingDependency } from './framedSyncInventoryRoundDelivery.js';
import { REQUEST_SYNC_BATCH_OBJECTS, type RequestSyncObjectResult } from './requestSyncBatchContract.js';

export type RequestSyncInventories = {
  local: readonly FramedSyncInventoryEntry[];
  remote: readonly FramedSyncInventoryEntry[];
};

export interface RequestSyncDatabaseRoundPort {
  exchangeInventory(): Promise<RequestSyncInventories>;
  transferObjects(differences: readonly FramedSyncInventoryDifference[]): Promise<readonly RequestSyncObjectResult[]>;
  reportObjectError(difference: FramedSyncInventoryDifference, error: unknown): void;
}

export const REQUEST_SYNC_MAX_PASSES = 4;

export async function runRequestSyncDatabaseRound(port: RequestSyncDatabaseRoundPort, signal?: AbortSignal) {
  let inventories = await port.exchangeInventory();
  let transferred = 0;
  let madeProgress = false;
  for (let pass = 0; pass < REQUEST_SYNC_MAX_PASSES; pass++) {
    signal?.throwIfAborted();
    const differences = compareFramedSyncDatabaseInventories(inventories);
    if (!differences.length) return { complete: true, pending: 0, transferred, madeProgress };
    const round = await deliverRequestSyncDatabaseDifferences(port, inventories, differences, signal);
    transferred += round.delivered.length;
    const next = await port.exchangeInventory();
    if (JSON.stringify(next.local) === JSON.stringify(inventories.local) &&
        JSON.stringify(next.remote) === JSON.stringify(inventories.remote)) {
      const pending = compareFramedSyncDatabaseInventories(next).length;
      return { complete: pending === 0 && round.deferred.length === 0,
        pending: Math.max(pending, round.deferred.length), transferred, madeProgress };
    }
    madeProgress = true;
    inventories = next;
  }
  const pending = compareFramedSyncDatabaseInventories(inventories).length;
  return { complete: pending === 0, pending, transferred, madeProgress };
}

export async function deliverRequestSyncDatabaseDifferences(port: RequestSyncDatabaseRoundPort,
  inventories: RequestSyncInventories, differences: readonly FramedSyncInventoryDifference[], signal?: AbortSignal) {
  const outcomes = new Map<string, RequestSyncObjectResult>();
  for (const batch of directionBatches(differences)) {
    signal?.throwIfAborted();
    const results = await port.transferObjects(batch);
    if (results.length !== batch.length) throw new Error('request_sync_batch_results_missing');
    for (const [index, difference] of batch.entries()) outcomes.set(key(difference), results[index]!);
  }
  const delivered: FramedSyncInventoryDifference[] = [];
  const completed = new Set<string>();
  const deferred = await deliverFramedSyncDifferencesInDependencyOrder(differences, async difference => {
    signal?.throwIfAborted();
    try {
      const cached = outcomes.get(key(difference));
      outcomes.delete(key(difference));
      const dependency = cached?.error ? readFramedSyncMissingDependency(cached.error) : null;
      const stale = dependency && completed.has(key({ ...difference, ...dependency }));
      const result = cached && !stale ? cached : (await port.transferObjects([difference]))[0];
      if (!result || result.globalId !== difference.globalId || result.objectType !== difference.objectType) {
        throw new Error('request_sync_batch_identity_mismatch');
      }
      if (result.error) throw new Error(result.error);
      delivered.push(difference);
      completed.add(key(difference));
      return 'delivered';
    } catch (error) {
      signal?.throwIfAborted();
      const detail = (error instanceof Error ? error.message : String(error)).replace(/^framed_sync_http_400:/u, '');
      const badGraph = ['node_version_missing_parents:', 'node_version_graph_cycle', 'framed_sync_node_parent_cycle',
        'node_version_parent_identity_mismatch:'].some(prefix => detail.startsWith(prefix));
      const changed = detail === 'framed_sync_source_changed' || detail === 'framed_sync_difference_request_source_changed';
      if (!badGraph && !changed) throw error;
      if (badGraph) port.reportObjectError(difference, error);
      return 'deferred';
    }
  }, createFramedSyncInventoryDependencyLookup(inventories));
  return { delivered, deferred };
}

function* directionBatches(differences: readonly FramedSyncInventoryDifference[]) {
  for (let offset = 0; offset < differences.length; offset += REQUEST_SYNC_BATCH_OBJECTS) {
    const window = differences.slice(offset, offset + REQUEST_SYNC_BATCH_OBJECTS);
    for (const direction of new Set(window.map(difference => difference.direction))) {
      yield window.filter(difference => difference.direction === direction);
    }
  }
}

function key(difference: FramedSyncInventoryDifference) {
  return `${difference.direction}\0${difference.objectType}\0${difference.globalId}`;
}
