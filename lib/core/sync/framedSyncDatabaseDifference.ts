import { compareFramedSyncInventories, iterateFramedSyncInventoryDifferences, type FramedSyncInventoryDifference } from './framedSyncInventory.js';

/** Complete database facts independently of file availability in the resource phase. */
export function compareFramedSyncDatabaseInventories(
  inventories: Parameters<typeof compareFramedSyncInventories>[0]
) {
  return Array.from(iterateFramedSyncDatabaseDifferences(inventories));
}

export function hasFramedSyncDatabaseDifference(inventories: Parameters<typeof compareFramedSyncInventories>[0]) {
  for (const _difference of iterateFramedSyncDatabaseDifferences(inventories)) return true;
  return false;
}

export function* iterateFramedSyncDatabaseDifferences(inventories: Parameters<typeof compareFramedSyncInventories>[0]): Generator<FramedSyncInventoryDifference> {
  for (const difference of iterateFramedSyncInventoryDifferences(inventories)) {
    const need = { ...difference.need, resourceHashes: [] };
    if (need.sharedState || need.frontierFactIds.length || need.requiredRelationIds.length ||
        need.reviewFactIds.length || need.stateFactIds?.length) yield { ...difference, need };
  }
}
