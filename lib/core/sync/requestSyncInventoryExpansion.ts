import type { DbPort } from './dbPort.js';
import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { compareInventoryEntry } from './framedSyncInventoryDigest.js';
import { readFramedSyncInventoryEntry } from './framedSyncInventoryRead.js';

/** Merge a later snapshot without treating a disappearing object as a deletion. */
export function mergeRequestSyncNodeDetails(entries: readonly FramedSyncInventoryEntry[],
  ids: readonly string[], details: readonly FramedSyncInventoryEntry[], deferred: Set<string>) {
  const selected = new Set(ids);
  const byId = new Map<string, FramedSyncInventoryEntry>();
  for (const entry of details) {
    if (entry.objectType !== 'node' || !selected.has(entry.globalId) || byId.has(entry.globalId)) {
      throw new Error('inventory_node_detail_identity_invalid');
    }
    byId.set(entry.globalId, entry);
  }
  for (const entry of entries) {
    if (entry.objectType === 'node' && selected.has(entry.globalId) && !byId.has(entry.globalId)) {
      deferred.add(entry.globalId);
    }
  }
  return [...entries.filter(entry => entry.objectType !== 'node' || !selected.has(entry.globalId)),
    ...details].sort(compareInventoryEntry);
}

export async function readRequestSyncNodeDetails(db: DbPort, ids: readonly string[]) {
  const entries: FramedSyncInventoryEntry[] = [];
  for (const globalId of ids) {
    const entry = await readFramedSyncInventoryEntry(db, { objectType: 'node', globalId });
    if (entry) entries.push(entry);
  }
  return entries;
}
