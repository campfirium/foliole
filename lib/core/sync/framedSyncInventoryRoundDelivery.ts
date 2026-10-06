import type { FramedSyncInventoryDifference } from './framedSyncInventory.js';

const PARENT_MISSING = 'framed_sync_node_parent_missing:';

function key(value: Pick<FramedSyncInventoryDifference, 'direction' | 'globalId'>) {
  return `${value.direction}\0${value.globalId}`;
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
  deliver: (difference: FramedSyncInventoryDifference) => Promise<void>
) {
  const available = new Map(differences.map((difference) => [key(difference), difference]));
  const active = new Set<string>();
  const delivered = new Set<string>();
  async function visit(difference: FramedSyncInventoryDifference): Promise<void> {
    const differenceKey = key(difference);
    if (delivered.has(differenceKey)) return;
    if (active.has(differenceKey)) throw new Error('framed_sync_node_parent_cycle');
    active.add(differenceKey);
    try {
      try {
        await deliver(difference);
      } catch (error) {
        const parentId = missingParentId(error);
        const parent = parentId ? available.get(key({ ...difference, globalId: parentId })) : null;
        if (!parent) throw error;
        await visit(parent);
        await deliver(difference);
      }
      delivered.add(differenceKey);
    } finally {
      active.delete(differenceKey);
    }
  }
  for (const difference of differences) await visit(difference);
}
