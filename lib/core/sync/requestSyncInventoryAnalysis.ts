import { iterateFramedSyncDatabaseDifferences } from './framedSyncDatabaseDifference.js';
import { sameFramedSyncInventoryEntry } from './framedSyncInventoryEntryEquality.js';
import type { RequestSyncInventories } from './requestSyncDatabaseRound.js';

/** Collect all decisions while validating and comparing this inventory, without another full scan. */
export function analyzeRequestSyncInventories(current: RequestSyncInventories, previous?: RequestSyncInventories) {
  const unready = new Map<string, { objectType: string; globalId: string; side: 'local' | 'remote' }>();
  let stateUnchanged = Boolean(previous && current.local.length === previous.local.length &&
    current.remote.length === previous.remote.length);
  const differences = Array.from(iterateFramedSyncDatabaseDifferences(current, (entry, side, index) => {
    if (entry.unready) unready.set(`${entry.objectType}\0${entry.globalId}`, { objectType: entry.objectType, globalId: entry.globalId, side });
    const before = previous?.[side][index];
    if (stateUnchanged && (!before || !sameFramedSyncInventoryEntry(entry, before))) stateUnchanged = false;
  }));
  return { differences, stateUnchanged, unready,
    pending: (current.inventoryDeferred ?? 0) + Math.max(differences.length, unready.size) };
}

export type RequestSyncInventoryAnalysis = ReturnType<typeof analyzeRequestSyncInventories>;
