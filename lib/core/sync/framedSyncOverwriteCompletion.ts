import { compareFramedSyncDatabaseInventories } from './framedSyncDatabaseDifference.js';
import { revalidateFramedSyncInventorySource, type FramedSyncInventoryDifference,
  type FramedSyncInventoryEntry } from './framedSyncInventory.js';

/** A verified source snapshot may coexist with a locally advanced node head. */
export function pendingFramedSyncOverwriteDifferences(args: {
  local: readonly FramedSyncInventoryEntry[];
  remote: readonly FramedSyncInventoryEntry[];
  deliveredDifferences: readonly FramedSyncInventoryDifference[];
}) {
  const verified = revalidateFramedSyncInventorySource({ currentSource: args.remote,
    differences: args.deliveredDifferences, direction: 'remote_to_local' }).readyDifferences;
  const deliveredNodes = new Set(verified.filter(entry => entry.objectType === 'node').map(entry => entry.globalId));
  return compareFramedSyncDatabaseInventories(args).filter(difference => {
    if (difference.direction !== 'remote_to_local') return false;
    const need = difference.need;
    return difference.objectType !== 'node' || !deliveredNodes.has(difference.globalId) ||
      need.frontierFactIds.length > 0 || need.requiredRelationIds.length > 0 ||
      need.reviewFactIds.length > 0 || (need.stateFactIds?.length ?? 0) > 0;
  });
}
