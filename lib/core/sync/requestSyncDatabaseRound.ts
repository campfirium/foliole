import { compareFramedSyncDatabaseInventories } from './framedSyncDatabaseDifference.js';
import type { FramedSyncInventoryDifference, FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { createFramedSyncInventoryDependencyLookup } from './framedSyncInventoryDependencyLookup.js';
import { deliverFramedSyncDifferencesInDependencyOrder } from './framedSyncInventoryRoundDelivery.js';

export type RequestSyncInventories = {
  local: readonly FramedSyncInventoryEntry[];
  remote: readonly FramedSyncInventoryEntry[];
};

export interface RequestSyncDatabaseRoundPort {
  exchangeInventory(): Promise<RequestSyncInventories>;
  transferObject(difference: FramedSyncInventoryDifference): Promise<unknown>;
  reportObjectError(difference: FramedSyncInventoryDifference, error: unknown): void;
}

export async function runRequestSyncDatabaseRound(port: RequestSyncDatabaseRoundPort, signal?: AbortSignal) {
  let inventories = await port.exchangeInventory();
  let transferred = 0;
  for (;;) {
    signal?.throwIfAborted();
    const differences = compareFramedSyncDatabaseInventories(inventories);
    if (!differences.length) return { complete: true, pending: 0, transferred };
    const round = await deliverRequestSyncDatabaseDifferences(port, inventories, differences, signal);
    transferred += round.delivered.length;
    const next = await port.exchangeInventory();
    if (JSON.stringify(next.local) === JSON.stringify(inventories.local) &&
        JSON.stringify(next.remote) === JSON.stringify(inventories.remote)) {
      const pending = compareFramedSyncDatabaseInventories(next).length;
      return { complete: pending === 0 && round.deferred.length === 0,
        pending: Math.max(pending, round.deferred.length), transferred };
    }
    inventories = next;
  }
}

export async function deliverRequestSyncDatabaseDifferences(port: RequestSyncDatabaseRoundPort,
  inventories: RequestSyncInventories, differences: readonly FramedSyncInventoryDifference[], signal?: AbortSignal) {
  const delivered: FramedSyncInventoryDifference[] = [];
  const deferred = await deliverFramedSyncDifferencesInDependencyOrder(differences, async difference => {
    signal?.throwIfAborted();
    try {
      await port.transferObject(difference);
      delivered.push(difference);
      return 'delivered';
    } catch (error) {
      signal?.throwIfAborted();
      const detail = (error instanceof Error ? error.message : String(error)).replace(/^framed_sync_http_400:/u, '');
      const badGraph = ['node_version_missing_parents:', 'node_version_graph_cycle',
        'node_version_parent_identity_mismatch:'].some(prefix => detail.startsWith(prefix));
      const changed = detail === 'framed_sync_source_changed' || detail === 'framed_sync_difference_request_source_changed';
      if (!badGraph && !changed) throw error;
      if (badGraph) port.reportObjectError(difference, error);
      return 'deferred';
    }
  }, createFramedSyncInventoryDependencyLookup(inventories));
  return { delivered, deferred };
}
