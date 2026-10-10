import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';

/** The first exchange carries no node history details. */
export function framedSyncInventorySummary(entries: readonly FramedSyncInventoryEntry[]) {
  return entries.map(entry => entry.objectType === 'node' ? {
    globalId: entry.globalId, objectType: entry.objectType, sharedStateHash: entry.sharedStateHash,
    unready: entry.unready, frontierFactIds: [], requiredRelationIds: [],
    reviewFactIds: [], stateFactIds: [], resourceHashes: []
  } : entry);
}

export function differingNodeIds(local: readonly FramedSyncInventoryEntry[], remote: readonly FramedSyncInventoryEntry[]) {
  const peers = new Map(remote.filter(entry => entry.objectType === 'node').map(entry => [entry.globalId, entry]));
  const ids = new Set<string>();
  for (const entry of local) {
    if (entry.objectType !== 'node') continue;
    const peer = peers.get(entry.globalId);
    if (!peer || entry.unready || peer.unready ||
      !entry.sharedStateHash.every((byte, index) => peer.sharedStateHash[index] === byte)) ids.add(entry.globalId);
    peers.delete(entry.globalId);
  }
  for (const id of peers.keys()) ids.add(id);
  return [...ids];
}
