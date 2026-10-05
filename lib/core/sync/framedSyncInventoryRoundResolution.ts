import {
  compareFramedSyncInventories,
  type FramedSyncDeferredObject,
  type FramedSyncInventoryDifference,
  type FramedSyncInventoryEntry
} from './framedSyncInventory.js';

type InventoryReader = Readonly<{
  readInventoryEntry(key: Readonly<{ globalId: string; objectType: string }>):
  Promise<FramedSyncInventoryEntry | null>;
}>;

export async function deferUnresolvedBidirectionalObjects(
  local: InventoryReader,
  remote: InventoryReader,
  differences: readonly FramedSyncInventoryDifference[],
  deferred: Map<string, FramedSyncDeferredObject>
) {
  const directions = new Map<string, Set<FramedSyncInventoryDifference['direction']>>();
  for (const difference of differences) {
    const key = `${difference.objectType}\0${difference.globalId}`;
    const values = directions.get(key) ?? new Set();
    values.add(difference.direction);
    directions.set(key, values);
  }
  for (const [key, values] of directions) {
    if (values.size < 2) continue;
    const [objectType, globalId] = key.split('\0');
    if (!objectType || !globalId) throw new Error('framed_sync_inventory_identity_invalid');
    const identity = { globalId, objectType };
    const [left, right] = await Promise.all([
      local.readInventoryEntry(identity), remote.readInventoryEntry(identity)
    ]);
    if (compareFramedSyncInventories({
      local: left ? [left] : [], remote: right ? [right] : []
    }).length) deferred.set(key, identity);
  }
}
