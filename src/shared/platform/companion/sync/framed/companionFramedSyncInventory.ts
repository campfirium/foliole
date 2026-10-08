import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import type { FramedSyncInventoryEntry } from '../../../../../../lib/core/sync/framedSyncInventory.js';
import {
  readFramedSyncInventory,
  readFramedSyncInventoryEntry
} from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';

const hex = (value: Uint8Array) => Array.from(value, (item) => item.toString(16).padStart(2, '0')).join('');

function serialize(entry: FramedSyncInventoryEntry) {
  return {
    frontier_fact_ids: entry.frontierFactIds,
    global_id: entry.globalId,
    object_type: entry.objectType,
    required_relation_ids: entry.requiredRelationIds,
    resource_hashes: entry.resourceHashes.map(hex),
    review_fact_ids: entry.reviewFactIds,
    state_fact_ids: entry.stateFactIds ?? [],
    shared_state_hash: hex(entry.sharedStateHash)
  };
}

export async function readCompanionFramedSyncInventory(db: DbPort) {
  const entries = await readFramedSyncInventory(db);
  return { entries: entries.map(serialize) };
}

export async function readCompanionFramedSyncInventoryEntry(
  db: DbPort,
  key: Readonly<{ globalId: string; objectType: string }>
) {
  const entry = await readFramedSyncInventoryEntry(db, key);
  return entry ? serialize(entry) : null;
}
