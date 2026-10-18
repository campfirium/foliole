import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import { flushCurrentParentOrderProjectionsWithDbPort } from './currentParentOrderStore.js';
import type { DbPort, DbRow } from './dbPort.js';
import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { inventoryColumns, inventoryEntryFromRow, type InventoryRow } from './framedSyncInventoryRead.js';
import { framedSyncInventorySummary } from './framedSyncInventorySummary.js';
import { readFramedSyncObjectStateInventory } from './framedSyncObjectStateInventory.js';
import { compareSyncFactText } from './syncFactKeyOrder.js';
import { syncGroupLocalPublicationBlockReason } from './syncGroupLocalAdoption.js';

async function missingDigests(db: DbPort) {
  return (await db.query<InventoryRow>(`SELECT ${inventoryColumns} FROM framed_sync_inventory inventory
    WHERE object_type = 'node' AND NOT EXISTS
      (SELECT 1 FROM framed_sync_node_digest digest WHERE digest.object_id = inventory.object_id)`))
    .map(inventoryEntryFromRow);
}

export async function flushRequestSyncInventoryDigests(db: DbPort) {
  await flushCurrentParentOrderProjectionsWithDbPort(db);
  for (const entry of await missingDigests(db)) {
    await db.run(`INSERT OR REPLACE INTO framed_sync_node_digest (object_id, shared_state_hash, unready)
      VALUES (?, ?, ?)`, [entry.globalId, bytesToHex(entry.sharedStateHash), entry.unready ? 1 : 0]);
  }
}

/** The read transaction also covers invalidation after the writer flush and before this snapshot. */
export async function readRequestSyncInventorySummaries(db: DbPort) {
  if (await syncGroupLocalPublicationBlockReason(db)) return [];
  const rows = await db.query<DbRow & { object_id: string; shared_state_hash: string; unready: number }>(
    'SELECT object_id, shared_state_hash, unready FROM framed_sync_node_digest ORDER BY object_id');
  const entries: FramedSyncInventoryEntry[] = rows.map(row => ({
    objectType: 'node', globalId: row.object_id, sharedStateHash: hexToBytes(row.shared_state_hash), unready: !!row.unready,
    frontierFactIds: [], requiredRelationIds: [], reviewFactIds: [], resourceHashes: [], stateFactIds: []
  }));
  entries.push(...framedSyncInventorySummary(await missingDigests(db)), ...await readFramedSyncObjectStateInventory(db));
  return entries.sort(compareInventoryEntry);
}

export async function expandRequestSyncNodeSummaries(db: DbPort, entries: readonly FramedSyncInventoryEntry[], ids: readonly string[]) {
  if (ids.length === 0) return [...entries];
  const requested = new Set(ids);
  const rows = await db.query<InventoryRow>(`SELECT ${inventoryColumns} FROM framed_sync_inventory inventory
    WHERE object_type = 'node' AND object_id IN (SELECT value FROM json_each(?))`, [JSON.stringify([...requested])]);
  const byId = new Map(rows.map(row => {
    const entry = inventoryEntryFromRow(row);
    return [entry.globalId, entry] as const;
  }));
  return entries.map(entry => {
    if (entry.objectType !== 'node' || !requested.has(entry.globalId)) return entry;
    const detail = byId.get(entry.globalId);
    if (!detail || !entry.sharedStateHash.every((value, index) => detail.sharedStateHash[index] === value) ||
        !!entry.unready !== !!detail.unready) throw new Error('framed_sync_source_changed');
    return detail;
  });
}

export function compareInventoryEntry(a: FramedSyncInventoryEntry, b: FramedSyncInventoryEntry) {
  return compareSyncFactText(a.objectType, b.objectType) || compareSyncFactText(a.globalId, b.globalId);
}
