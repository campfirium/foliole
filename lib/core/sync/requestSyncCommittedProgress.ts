import type { FramedSyncInventoryDifference, FramedSyncInventoryEntry } from './framedSyncInventory.js';
import type { RequestSyncInventories } from './requestSyncDatabaseRound.js';

function target(inventories: RequestSyncInventories, difference: FramedSyncInventoryDifference) {
  return inventories[difference.direction === 'local_to_remote' ? 'remote' : 'local']
    .find(entry => entry.objectType === difference.objectType && entry.globalId === difference.globalId);
}

function sameHash(left: FramedSyncInventoryEntry | undefined, right: FramedSyncInventoryEntry) {
  return left?.sharedStateHash.length === right.sharedStateHash.length &&
    left.sharedStateHash.every((byte, index) => byte === right.sharedStateHash[index]);
}

/** A successful receipt alone is insufficient: the next inventory must confirm changed target facts. */
export function hasConfirmedRequestSyncCommit(before: RequestSyncInventories, after: RequestSyncInventories,
  delivered: readonly FramedSyncInventoryDifference[]) {
  return delivered.some(difference => {
    const previous = target(before, difference);
    const current = target(after, difference);
    if (!current || sameHash(previous, current)) return false;
    if (sameHash(current, difference.sourceSnapshot)) return true;
    return (['frontierFactIds', 'requiredRelationIds', 'reviewFactIds', 'stateFactIds'] as const).some(field => {
      const known = new Set(previous?.[field] ?? []);
      const now = new Set(current[field] ?? []);
      return (difference.need[field] ?? []).some(id => !known.has(id) && now.has(id));
    });
  });
}
