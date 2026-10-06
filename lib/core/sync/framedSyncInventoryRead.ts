import { hexToBytes } from '@noble/hashes/utils.js';
import { z } from 'zod';

import type { DbPort, DbRow } from './dbPort.js';
import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { readFramedSyncObjectStateInventory } from './framedSyncObjectStateInventory.js';
import { loadSyncGroupLocalAdoption } from './syncGroupLocalAdoption.js';
import { compareSyncIdentityText } from './syncIdentityKeyOrder.js';

type InventoryKey = Readonly<{ globalId: string; objectType: string }>;
interface InventoryRow extends DbRow {
  content_hash: string;
  frontier_json: string;
  object_id: string;
  relations_json: string;
  resources_json: string;
  reviews_json: string;
  states_json: string;
}
const ids = z.array(z.string().min(1));
const hashes = z.array(z.string().regex(/^[a-f0-9]{64}$/u));

function entry(row: InventoryRow): FramedSyncInventoryEntry {
  if (!/^[a-f0-9]{64}$/u.test(row.content_hash)) {
    throw new Error('framed_sync_inventory_state_hash_invalid');
  }
  return {
    frontierFactIds: ids.parse(JSON.parse(row.frontier_json)),
    globalId: row.object_id, objectType: 'node',
    requiredRelationIds: ids.parse(JSON.parse(row.relations_json)),
    resourceHashes: hashes.parse(JSON.parse(row.resources_json)).map(hexToBytes),
    reviewFactIds: ids.parse(JSON.parse(row.reviews_json)),
    sharedStateHash: hexToBytes(row.content_hash),
    stateFactIds: ids.parse(JSON.parse(row.states_json))
  };
}

async function read(port: DbPort, key?: InventoryKey) {
  if (key && key.objectType !== 'node') return readFramedSyncObjectStateInventory(port, key);
  const rows = await port.query<InventoryRow>(`SELECT * FROM framed_sync_inventory
    WHERE object_type = 'node' ${key ? 'AND object_id = ?' : ''} ORDER BY object_id`,
  key ? [key.globalId] : []);
  const nodes = rows.map(entry);
  const states = key ? [] : await readFramedSyncObjectStateInventory(port);
  return [...nodes, ...states].sort((left, right) =>
    compareSyncIdentityText(left.objectType, right.objectType) ||
    compareSyncIdentityText(left.globalId, right.globalId));
}

export function readFramedSyncInventory(port: DbPort) {
  return port.transaction(async (tx) => await loadSyncGroupLocalAdoption(tx) ? [] : read(tx));
}

export async function readFramedSyncInventoryEntry(port: DbPort, key: InventoryKey) {
  const values = await port.transaction((tx) => read(tx, key));
  return values[0] ?? null;
}
