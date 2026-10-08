import { hexToBytes } from '@noble/hashes/utils.js';
import { z } from 'zod';

import type { DbPort, DbRow } from './dbPort.js';
import { expireFramedSyncCompletions } from './framedSyncCompletionRetention.js';
import type { FramedSyncContext } from './framedSyncContract.js';
import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { readFramedSyncObjectStateInventory } from './framedSyncObjectStateInventory.js';
import { publishParentOrderPosition } from './parentOrderMemberPosition.js';
import { syncGroupLocalPublicationBlockReason } from './syncGroupLocalAdoption.js';
import { assertSyncGroupOverwriteInbound } from './syncGroupOverwriteProgress.js';
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

async function read(port: DbPort, key: InventoryKey | undefined) {
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
  return port.transaction(async (tx) => {
    if (await syncGroupLocalPublicationBlockReason(tx)) return [];
    await expireFramedSyncCompletions(tx);
    for (const row of await tx.query<{ parent_id: string }>('SELECT parent_id FROM parent_order_heads')) {
      await publishParentOrderPosition(tx, row.parent_id);
    }
    return read(tx, undefined);
  });
}

/** Partial inventory is visible only to the fixed recovery source, without publishing local work. */
export function readFramedSyncOverwriteInventory(port: DbPort, context: FramedSyncContext) {
  return port.transaction(async (tx) => {
    if (!await assertSyncGroupOverwriteInbound(tx, context)) throw new Error('sync_group_overwrite_missing');
    return read(tx, undefined);
  });
}

export async function readFramedSyncInventoryEntry(port: DbPort, key: InventoryKey) {
  const values = await port.transaction((tx) => read(tx, key));
  return values[0] ?? null;
}
