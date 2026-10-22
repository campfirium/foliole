import { compareFramedSyncDatabaseInventories, unreadyFramedSyncDatabaseObjectCount } from './framedSyncDatabaseDifference.js';
import type { FramedSyncInventoryDifference, FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { createFramedSyncInventoryDependencyLookup } from './framedSyncInventoryDependencyLookup.js';
import { deliverFramedSyncDifferencesInDependencyOrder, readFramedSyncMissingDependency } from './framedSyncInventoryRoundDelivery.js';
import { REQUEST_SYNC_BATCH_OBJECTS, type RequestSyncObjectResult } from './requestSyncBatchContract.js';
import { hasConfirmedRequestSyncCommit } from './requestSyncCommittedProgress.js';

export type RequestSyncInventories = {
  local: readonly FramedSyncInventoryEntry[];
  remote: readonly FramedSyncInventoryEntry[];
  inventoryDeferred?: number;
};

export interface RequestSyncDatabaseRoundPort {
  exchangeInventory(): Promise<RequestSyncInventories>;
  transferObjects(differences: readonly FramedSyncInventoryDifference[]): Promise<readonly RequestSyncObjectResult[]>;
  reportObjectError(difference: FramedSyncInventoryDifference, error: unknown): void;
  /** Starts watching for local changes; when one arrives, the pass stops pulling so it can go out first. */
  watchLocalChanges?(): () => boolean;
}

export const REQUEST_SYNC_MAX_PASSES = 4;
/** Pull batch while local changes may be waiting: applying it is the longest wait a new edit can see. */
export const REQUEST_SYNC_YIELDING_PULL_OBJECTS = 32;

export async function runRequestSyncDatabaseRound(port: RequestSyncDatabaseRoundPort, signal?: AbortSignal) {
  let inventories = await port.exchangeInventory();
  let transferred = 0;
  const initialPending = pendingObjects(inventories);
  let sourceChanged = Boolean(inventories.inventoryDeferred);
  let committed = false;
  const result = (pending: number) => ({ complete: pending === 0, pending, transferred,
    madeProgress: pending < initialPending,
    ...(pending > 0 && pending >= initialPending && sourceChanged && committed ? { dynamicBacklog: true as const } : {}) });
  for (let pass = 0; pass < REQUEST_SYNC_MAX_PASSES; pass++) {
    signal?.throwIfAborted();
    const differences = compareFramedSyncDatabaseInventories(inventories);
    if (!differences.length && !inventories.inventoryDeferred) {
      const pending = pendingObjects(inventories);
      return result(pending);
    }
    const round = await deliverRequestSyncDatabaseDifferences(port, inventories, differences, signal);
    transferred += round.delivered.length;
    const next = await port.exchangeInventory();
    sourceChanged ||= round.sourceChanged || Boolean(next.inventoryDeferred);
    committed ||= hasConfirmedRequestSyncCommit(inventories, next, round.delivered);
    if (JSON.stringify(next.local) === JSON.stringify(inventories.local) &&
        JSON.stringify(next.remote) === JSON.stringify(inventories.remote) &&
        !next.inventoryDeferred && !inventories.inventoryDeferred) {
      const pending = Math.max(pendingObjects(next), round.deferred.length);
      return result(pending);
    }
    inventories = next;
  }
  const pending = pendingObjects(inventories);
  return result(pending);
}

export async function deliverRequestSyncDatabaseDifferences(port: RequestSyncDatabaseRoundPort,
  inventories: RequestSyncInventories, differences: readonly FramedSyncInventoryDifference[], signal?: AbortSignal) {
  const outcomes = new Map<string, RequestSyncObjectResult>();
  const localChanged = port.watchLocalChanges?.();
  const attempted: FramedSyncInventoryDifference[] = [];
  for (const batch of directionBatches(differences, localChanged ? REQUEST_SYNC_YIELDING_PULL_OBJECTS : REQUEST_SYNC_BATCH_OBJECTS)) {
    signal?.throwIfAborted();
    if (localChanged?.() && batch[0]!.direction === 'remote_to_local') break;
    const results = await port.transferObjects(batch);
    if (results.length !== batch.length) throw new Error('request_sync_batch_results_missing');
    for (const [index, difference] of batch.entries()) outcomes.set(key(difference), results[index]!);
    attempted.push(...batch);
  }
  const delivered: FramedSyncInventoryDifference[] = [];
  const completed = new Set<string>();
  let sourceChanged = false;
  const deferred = await deliverFramedSyncDifferencesInDependencyOrder(attempted, async difference => {
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
      const badGraph = ['request_sync_current_version_unavailable', 'node_version_cross_object_parent:', 'node_version_graph_cycle', 'framed_sync_node_parent_cycle',
        'node_version_parent_identity_mismatch:'].some(prefix => detail.startsWith(prefix));
      const changed = detail === 'framed_sync_source_changed' || detail === 'framed_sync_difference_request_source_changed';
      if (!badGraph && !changed) throw error;
      if (badGraph) port.reportObjectError(difference, error);
      sourceChanged ||= changed;
      return 'deferred';
    }
  }, createFramedSyncInventoryDependencyLookup(inventories));
  return { delivered, deferred, sourceChanged };
}

/** Local changes go out first, so an edit never waits behind applying what the peer sent. */
function* directionBatches(differences: readonly FramedSyncInventoryDifference[], pullObjects: number) {
  for (const direction of ['local_to_remote', 'remote_to_local'] as const) {
    const items = differences.filter(difference => difference.direction === direction);
    const size = direction === 'remote_to_local' ? pullObjects : REQUEST_SYNC_BATCH_OBJECTS;
    for (let offset = 0; offset < items.length; offset += size) yield items.slice(offset, offset + size);
  }
}

function key(difference: FramedSyncInventoryDifference) {
  return `${difference.direction}\0${difference.objectType}\0${difference.globalId}`;
}

function pendingObjects(inventories: RequestSyncInventories) {
  return (inventories.inventoryDeferred ?? 0) + Math.max(compareFramedSyncDatabaseInventories(inventories).length,
    unreadyFramedSyncDatabaseObjectCount(inventories));
}
