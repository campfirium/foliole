import type { DbPort } from './dbPort.js';
import type { FramedSyncInventoryDifference, FramedSyncInventoryEntry } from './framedSyncInventory.js';
import type { NodeVersionGraph } from './nodeVersionGraph.js';
import { readRequestSyncNodeGraph } from './requestSyncNodeGraph.js';
import { loadRetainedSyncNodeVersionFact } from './syncNodeGraph.js';
import { isNodeVersionIdentityOnly } from './syncNodeVersionHistory.js';

export function assertRequestedFactsAvailable(current: FramedSyncInventoryEntry,
  difference: FramedSyncInventoryDifference) {
  if (current.objectType !== difference.objectType || current.globalId !== difference.globalId) {
    throw new Error('request_sync_object_identity_mismatch');
  }
  for (const [requested, available] of [
    [difference.need.frontierFactIds, current.frontierFactIds],
    [difference.need.requiredRelationIds, current.requiredRelationIds],
    [difference.need.reviewFactIds, current.reviewFactIds],
    [difference.need.stateFactIds ?? [], current.stateFactIds ?? []]
  ] as const) {
    const known = new Set(available);
    if (new Set(requested).size !== requested.length || requested.some(id => !known.has(id))) {
      throw new Error('framed_sync_source_changed');
    }
  }
}

export async function selectRequestSyncNodeSource(db: DbPort, current: FramedSyncInventoryEntry,
  difference: FramedSyncInventoryDifference) {
  assertRequestedFactsAvailable(current, difference);
  const selected = difference.sourceSnapshot.currentVersionId;
  if (!selected || !current.currentVersionId) throw new Error('framed_sync_source_changed');
  const graph = await readRequestSyncNodeGraph(db, current.globalId);
  if (selected !== current.currentVersionId &&
      !await isSelectedAncestor(db, current, selected, graph)) throw new Error('framed_sync_source_changed');
  const record = await loadRetainedSyncNodeVersionFact(db, selected, false);
  if (!record || record.object_id !== current.globalId || isNodeVersionIdentityOnly(record)) {
    throw new Error('framed_sync_source_changed');
  }
  return { ...current, currentVersionId: selected };
}

async function isSelectedAncestor(db: DbPort, current: FramedSyncInventoryEntry,
  selected: string, graph: NodeVersionGraph) {
  const head = current.currentVersionId!;
  if (graph.parents.has(head)) return graph.hasAncestor(head, selected);
  const tombstone = await loadRetainedSyncNodeVersionFact(db, head, false);
  if (!tombstone?.is_tombstone || tombstone.object_id !== current.globalId) return false;
  return (tombstone.parent_version_ids ?? []).some(parent => graph.parents.has(parent) &&
    (parent === selected || graph.hasAncestor(parent, selected)));
}
