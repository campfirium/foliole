
import type { DbPort } from './dbPort.js';
import { loadAncestorMetadata, loadSyncNodeAncestorGraph, type SyncNodeAncestorGraph } from './syncNodeAncestorGraph.js';
import { loadMergeBaseCandidates } from './syncNodeGraph.js';
import type { SyncNodeRecordMetadata } from './syncNodeRecordSource.js';

export async function loadTopicTextConflictMetadata(db: DbPort,
  left: SyncNodeRecordMetadata, right: SyncNodeRecordMetadata, graph?: SyncNodeAncestorGraph) {
  graph ??= await loadSyncNodeAncestorGraph(db, [left.version_id!, right.version_id!]);
  const ids = await loadMergeBaseCandidates(db, left.version_id!, right.version_id!, graph);
  const values = await loadAncestorMetadata(db, ids, graph);
  const first = values[0];
  return first && values.length === ids.length && values.every((value) =>
    value.parent_id === first.parent_id && value.deleted_at === first.deleted_at && value.selection_id === first.selection_id) ? first : null;
}

export function mainSelectionId(record: SyncNodeRecordMetadata) {
  return record.snapshot.text_selection?.version_id ?? record.version_id;
}

export async function selectChangedTopicMain<T extends SyncNodeRecordMetadata>(db: DbPort, left: T, right: T, graph?: SyncNodeAncestorGraph) {
  const base = await loadTopicTextConflictMetadata(db, left, right, graph);
  if (!base) return null;
  const leftUnchanged = mainSelectionId(left) === base.selection_id;
  const rightUnchanged = mainSelectionId(right) === base.selection_id;
  return leftUnchanged === rightUnchanged ? null : leftUnchanged ? right : left;
}
