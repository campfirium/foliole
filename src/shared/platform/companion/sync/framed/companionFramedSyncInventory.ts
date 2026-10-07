import type { DbPort } from '../../../../../../lib/core/sync/dbPort';
import type { FramedSyncInventoryEntry } from '../../../../../../lib/core/sync/framedSyncInventory';
import {
  readFramedSyncInventory,
  readFramedSyncInventoryEntry
} from '../../../../../../lib/core/sync/framedSyncInventoryRead';
import type { NodeVersionBodyStorage } from '../../../../../../lib/core/sync/syncNodeTombstoneVersion.js';

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

export async function readCompanionFramedSyncInventory(db: DbPort, bodyStorage: NodeVersionBodyStorage = 'continuous') {
  const entries = await readFramedSyncInventory(db, bodyStorage);
  return { entries: entries.map(serialize) };
}

export async function readCompanionFramedSyncInventoryEntry(
  db: DbPort,
  key: Readonly<{ globalId: string; objectType: string }>,
  bodyStorage: NodeVersionBodyStorage = 'continuous'
) {
  const entry = await readFramedSyncInventoryEntry(db, key, bodyStorage);
  return entry ? serialize(entry) : null;
}
