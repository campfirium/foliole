import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import { flushCurrentParentOrderProjectionsWithDbPort } from './currentParentOrderStore.js';
import type { DbPort, DbRow, DbValue } from './dbPort.js';
import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { inventoryColumns, inventoryEntryFromRow, type InventoryRow } from './framedSyncInventoryRead.js';
import { framedSyncInventorySummary } from './framedSyncInventorySummary.js';
import { readFramedSyncObjectStateInventory } from './framedSyncObjectStateInventory.js';
import { compareSyncFactText } from './syncFactKeyOrder.js';
import { syncGroupLocalPublicationBlockReason } from './syncGroupLocalAdoption.js';

const DIGEST_READ_BATCH = 256;
type DigestRow = DbRow & { object_id: string; shared_state_hash: string; unready: number };

async function* readDigestBatches(db: DbPort, nodeIds?: readonly string[]) {
  const selected = nodeIds ? JSON.stringify(nodeIds) : undefined;
  let after: string | undefined;
  for (;;) {
    const conditions: string[] = [];
    const params: DbValue[] = [];
    if (selected !== undefined) {
      conditions.push('object_id IN (SELECT value FROM json_each(?))');
      params.push(selected);
    }
    if (after !== undefined) {
      conditions.push('object_id > ?');
      params.push(after);
    }
    const rows = await db.query<DigestRow>(`SELECT object_id, shared_state_hash, unready FROM framed_sync_node_digest
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY object_id LIMIT ?`,
    [...params, DIGEST_READ_BATCH]);
    if (rows.length) yield rows;
    if (rows.length < DIGEST_READ_BATCH) return;
    after = rows[rows.length - 1]!.object_id;
  }
}

async function missingDigests(db: DbPort, nodeIds?: readonly string[]) {
  return (await db.query<InventoryRow>(`SELECT ${inventoryColumns} FROM framed_sync_inventory inventory
    WHERE object_type = 'node' ${nodeIds ? 'AND object_id IN (SELECT value FROM json_each(?))' : ''} AND NOT EXISTS
      (SELECT 1 FROM framed_sync_node_digest digest WHERE digest.object_id = inventory.object_id)`,
  nodeIds ? [JSON.stringify(nodeIds)] : []))
    .map(inventoryEntryFromRow);
}

export async function flushRequestSyncInventoryDigests(db: DbPort, nodeIds?: readonly string[]) {
  await flushCurrentParentOrderProjectionsWithDbPort(db);
  for (const entry of await missingDigests(db, nodeIds)) {
    await db.run(`INSERT OR REPLACE INTO framed_sync_node_digest (object_id, shared_state_hash, unready)
      VALUES (?, ?, ?)`, [entry.globalId, bytesToHex(entry.sharedStateHash), entry.unready ? 1 : 0]);
  }
}

/** The read transaction also covers invalidation after the writer flush and before this snapshot. */
export async function readRequestSyncInventorySummaries(db: DbPort, nodeIds?: readonly string[]) {
  if (await syncGroupLocalPublicationBlockReason(db)) return [];
  const entries: FramedSyncInventoryEntry[] = [];
  // Keep the caller's snapshot, but release the native plugin thread between bounded returns.
  for await (const rows of readDigestBatches(db, nodeIds)) entries.push(...rows.map(row => ({
    objectType: 'node' as const, globalId: row.object_id, sharedStateHash: hexToBytes(row.shared_state_hash), unready: !!row.unready,
    frontierFactIds: [], requiredRelationIds: [], reviewFactIds: [], resourceHashes: [], stateFactIds: []
  })));
  entries.push(...framedSyncInventorySummary(await missingDigests(db, nodeIds)));
  if (!nodeIds) entries.push(...await readFramedSyncObjectStateInventory(db));
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
