import { compareFramedSyncInventories, type FramedSyncInventoryEntry, type FramedSyncInventoryDifference } from './framedSyncInventory.js';

const MISSING_DEPENDENCIES = ['framed_sync_node_parent_missing:', 'node_position_lineage_unproven:', 'parent_order_position_lineage_unproven:', 'sync_parent_order_body_unavailable:'];
export type FramedSyncDifferenceDelivery = 'delivered' | 'deferred';

function key(value: Pick<FramedSyncInventoryDifference, 'direction' | 'globalId' | 'objectType'>) {
  return `${value.direction}\0${value.objectType}\0${value.globalId}`;
}

function missingParentId(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const prefix = MISSING_DEPENDENCIES.find((candidate) => message.includes(candidate));
  return prefix
    ? { globalId: message.slice(message.indexOf(prefix) + prefix.length).trim().split(/\s/u, 1)[0]!,
      objectType: prefix === 'node_position_lineage_unproven:' || prefix === 'framed_sync_node_parent_missing:' ? 'node' : 'order_version' }
    : null;
}

export async function deliverFramedSyncDifferencesInDependencyOrder(
  differences: readonly FramedSyncInventoryDifference[],
  deliver: (difference: FramedSyncInventoryDifference) => Promise<FramedSyncDifferenceDelivery>,
  dependencies: readonly FramedSyncInventoryDifference[] = []
) {
  const available = new Map([...dependencies, ...differences].map((difference) => [key(difference), difference]));
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
      for (;;) {
        try {
          result = await deliver(difference);
          break;
        } catch (error) {
          const dependency = missingParentId(error);
          const parent = dependency ? available.get(key({ ...difference, ...dependency })) : null;
          if (!parent || delivered.has(key(parent))) throw error;
          if (!await visit(parent)) {
            deferred.set(differenceKey, difference);
            return false;
          }
        }
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

/** Equal identities can still be missing a body needed by a newly discovered branch. */
export function framedSyncOrderBodyDependencies(inventories: { local: readonly FramedSyncInventoryEntry[];
  remote: readonly FramedSyncInventoryEntry[] }) {
  return [
    ...compareFramedSyncInventories({ local: inventories.local.filter((row) => row.objectType === 'order_version'), remote: [] }),
    ...compareFramedSyncInventories({ local: [], remote: inventories.remote.filter((row) => row.objectType === 'order_version') })
  ];
}
