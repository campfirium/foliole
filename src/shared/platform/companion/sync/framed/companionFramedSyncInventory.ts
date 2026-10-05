import type { DbPort } from '../../../../../../lib/core/sync/dbPort';
import { readFramedSyncInventory } from '../../../../../../lib/core/sync/framedSyncInventoryRead';

const hex = (value: Uint8Array) => Array.from(value, (item) => item.toString(16).padStart(2, '0')).join('');

export async function readCompanionFramedSyncInventory(db: DbPort) {
  const entries = await readFramedSyncInventory(db);
  return {
    entries: entries.map((entry) => ({
      frontier_fact_ids: entry.frontierFactIds,
      global_id: entry.globalId,
      object_type: entry.objectType,
      required_relation_ids: entry.requiredRelationIds,
      resource_hashes: entry.resourceHashes.map(hex),
      review_fact_ids: entry.reviewFactIds,
      shared_state_hash: hex(entry.sharedStateHash)
    }))
  };
}
