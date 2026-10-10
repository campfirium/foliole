import { compareFramedSyncDatabaseInventories } from './framedSyncDatabaseDifference.js';
import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import type { FramedSyncDependencyResolver } from './framedSyncInventoryRoundDelivery.js';
import { compareSyncIdentityText } from './syncIdentityKeyOrder.js';

/** Read dependency needs from the same fixed inventory without cloning the whole graph. */
export function createFramedSyncInventoryDependencyLookup(inventories: {
  local: readonly FramedSyncInventoryEntry[]; remote: readonly FramedSyncInventoryEntry[]
}): FramedSyncDependencyResolver {
  return key => {
    const outbound = key.direction === 'local_to_remote';
    const source = findEntry(outbound ? inventories.local : inventories.remote, key);
    if (!source) return undefined;
    const destination = findEntry(outbound ? inventories.remote : inventories.local, key);
    const differences = (remote: readonly FramedSyncInventoryEntry[]) => compareFramedSyncDatabaseInventories(
      outbound ? { local: [source], remote } : { local: remote, remote: [source] });
    const missing = differences(destination ? [destination] : []).find(item => item.direction === key.direction);
    // Equal arrangement identities may still lack a body required by another branch.
    return missing ?? (key.objectType === 'order_version' ? differences([])[0] : undefined);
  };
}

function findEntry(entries: readonly FramedSyncInventoryEntry[], key: {
  globalId: string; objectType: string
}) {
  let low = 0;
  let high = entries.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const entry = entries[middle]!;
    const order = compareSyncIdentityText(entry.objectType, key.objectType) ||
      compareSyncIdentityText(entry.globalId, key.globalId);
    if (!order) return entry;
    if (order < 0) low = middle + 1;
    else high = middle - 1;
  }
  return undefined;
}
