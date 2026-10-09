import { compareFramedSyncInventories, type FramedSyncInventoryEntry, type FramedSyncInventoryDifference } from './framedSyncInventory.js';

const MISSING_DEPENDENCIES = {
  'framed_sync_node_parent_missing:': 'node',
  'node_position_lineage_unproven:': 'node',
  'framed_sync_review_node_missing:': 'node',
  'sync_node_open_state_node_missing:': 'node',
  'sync_parent_order_member_missing:': 'node',
  'framed_sync_parent_relation_version_missing:': 'node_version',
  'parent_order_position_lineage_unproven:': 'order_version',
  'sync_parent_order_body_unavailable:': 'order_version'
} as const;
export type FramedSyncDifferenceDelivery = 'delivered' | 'deferred';

function key(value: Pick<FramedSyncInventoryDifference, 'direction' | 'globalId' | 'objectType'>) {
  return `${value.direction}\0${value.objectType}\0${value.globalId}`;
}

export function readFramedSyncMissingDependency(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  const raw = detail.startsWith('round: Error: ')
    ? detail.slice('round: Error: '.length).split('\n', 1)[0]!
    : detail;
  const message = raw.replace(/^(?:framed_sync_http_400:|Failed to pull framed Sync object\. Cause: |Failed to pull framed Sync objects?: )/u, '');
  const prefix = (Object.keys(MISSING_DEPENDENCIES) as (keyof typeof MISSING_DEPENDENCIES)[])
    .find((candidate) => message.startsWith(candidate));
  const globalId = prefix ? message.slice(prefix.length) : '';
  if (!globalId || globalId.length > 128 || /[^A-Za-z0-9_-]/u.test(globalId)) return null;
  return prefix
    ? { code: prefix, globalId, objectType: MISSING_DEPENDENCIES[prefix] }
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
          const dependency = readFramedSyncMissingDependency(error);
          const parent = dependency ? available.get(key({ ...difference, ...dependency })) : null;
          if (!dependency) throw error;
          if (parent && key(parent) === differenceKey && dependency.code !== 'framed_sync_review_node_missing:') {
            throw new Error('framed_sync_node_parent_cycle');
          }
          if (!parent || key(parent) === differenceKey || delivered.has(key(parent))) {
            deferred.set(differenceKey, difference);
            return false;
          }
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
