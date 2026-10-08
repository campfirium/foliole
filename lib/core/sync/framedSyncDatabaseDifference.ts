import { compareFramedSyncInventories } from './framedSyncInventory.js';

/** Complete database facts independently of file availability in the resource phase. */
export function compareFramedSyncDatabaseInventories(
  inventories: Parameters<typeof compareFramedSyncInventories>[0]
) {
  return compareFramedSyncInventories(inventories).flatMap((difference) => {
    const need = { ...difference.need, resourceHashes: [] };
    return need.sharedState || need.frontierFactIds.length || need.requiredRelationIds.length ||
      need.reviewFactIds.length || need.stateFactIds?.length ? [{ ...difference, need }] : [];
  });
}
