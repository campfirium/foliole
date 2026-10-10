import { compareFramedSyncDatabaseInventories } from './framedSyncDatabaseDifference.js';
import { revalidateFramedSyncInventorySource, type FramedSyncInventoryDifference,
  type FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { isFramedSyncSharedStateObject } from './framedSyncObjectStateInventory.js';

/** Source consumption can preserve a newer local head or a merged current state. */
export function pendingFramedSyncOverwriteDifferences(args: {
  local: readonly FramedSyncInventoryEntry[];
  remote: readonly FramedSyncInventoryEntry[];
  deliveredDifferences: readonly FramedSyncInventoryDifference[];
}) {
  const verified = revalidateFramedSyncInventorySource({ currentSource: args.remote,
    differences: args.deliveredDifferences, direction: 'remote_to_local' }).readyDifferences;
  const key = (entry: { objectType: string; globalId: string }) => `${entry.objectType}\0${entry.globalId}`;
  const delivered = new Set(verified.map(key));
  const present = new Set(args.local.map(key));
  return compareFramedSyncDatabaseInventories(args).filter(difference => {
    if (difference.direction !== 'remote_to_local') return false;
    const need = difference.need;
    if (!delivered.has(key(difference)) || !present.has(key(difference))) return true;
    if (difference.objectType !== 'node') {
      return difference.objectType === 'order_version' ||
        !isFramedSyncSharedStateObject(difference.objectType, difference.globalId);
    }
    return Boolean(difference.sourceSnapshot.unready || args.local.find(entry => key(entry) === key(difference))?.unready) ||
      need.frontierFactIds.length > 0 || need.requiredRelationIds.length > 0 ||
      need.reviewFactIds.length > 0 || (need.stateFactIds?.length ?? 0) > 0;
  });
}
