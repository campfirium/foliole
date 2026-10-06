import type { FramedSyncInventoryDifference } from './framedSyncInventory.js';

const PARENT_MISSING = 'framed_sync_node_parent_missing:';
export type FramedSyncDifferenceDelivery = 'delivered' | 'deferred';

function key(value: Pick<FramedSyncInventoryDifference, 'direction' | 'globalId' | 'objectType'>) {
  return `${value.direction}\0${value.objectType}\0${value.globalId}`;
}

function missingParentId(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const offset = message.indexOf(PARENT_MISSING);
  return offset < 0
    ? null
    : message.slice(offset + PARENT_MISSING.length).trim().split(/\s/u, 1)[0] || null;
}

export async function deliverFramedSyncDifferencesInDependencyOrder(
  differences: readonly FramedSyncInventoryDifference[],
  deliver: (difference: FramedSyncInventoryDifference) => Promise<FramedSyncDifferenceDelivery>
) {
  const available = new Map(differences.map((difference) => [key(difference), difference]));
  const active = new Set<string>();
  const delivered = new Set<string>();
  const deferred = new Map<string, FramedSyncInventoryDifference>();
  async function visit(difference: FramedSyncInventoryDifference): Promise<boolean> {
    const differenceKey = key(difference);
    if (delivered.has(differenceKey)) return true;
    if (deferred.has(differenceKey)) return false;
    if (active.has(differenceKey)) throw new Error('framed_sync_node_parent_cycle');
    active.add(differenceKey);
    try {
      let result: FramedSyncDifferenceDelivery;
      try {
        result = await deliver(difference);
      } catch (error) {
        const parentId = missingParentId(error);
        const parent = parentId ? available.get(key({ ...difference, objectType: 'node', globalId: parentId })) : null;
        if (!parent) throw error;
        if (!await visit(parent)) {
          deferred.set(differenceKey, difference);
          return false;
        }
        result = await deliver(difference);
      }
      if (result === 'deferred') {
        deferred.set(differenceKey, difference);
        return false;
      }
      delivered.add(differenceKey);
      return true;
    } finally {
      active.delete(differenceKey);
    }
  }
  for (const difference of differences) await visit(difference);
  return [...deferred.values()];
}
