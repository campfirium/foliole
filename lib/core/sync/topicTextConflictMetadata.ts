
import type { DbPort } from './dbPort.js';
import { loadMergeBaseCandidates } from './syncNodeGraph.js';
import type { SyncNodeRecordMetadata } from './syncNodeRecordSource.js';

export async function loadTopicTextConflictMetadata(db: DbPort,
  left: SyncNodeRecordMetadata, right: SyncNodeRecordMetadata) {
  const ids = await loadMergeBaseCandidates(db, left.version_id!, right.version_id!);
  const values: Array<{ parent_id: string | null; deleted_at: string | null; selection_id: string }> = [];
  for (const id of ids) {
    const [row] = await db.query<{ parent_id: string | null; deleted_at: string | null; selection_id: string }>(
      `SELECT json_extract(snapshot_json, '$.parent_id') AS parent_id,
         json_extract(snapshot_json, '$.deleted_at') AS deleted_at,
         COALESCE(json_extract(snapshot_json, '$.text_selection.version_id'), version_id) AS selection_id
       FROM node_sync_versions WHERE version_id = ?`, [id]);
    if (row) values.push(row);
  }
  const first = values[0];
  return first && values.length === ids.length && values.every((value) =>
    value.parent_id === first.parent_id && value.deleted_at === first.deleted_at && value.selection_id === first.selection_id) ? first : null;
}

export function mainSelectionId(record: SyncNodeRecordMetadata) {
  return record.snapshot.text_selection?.version_id ?? record.version_id;
}

export async function selectChangedTopicMain<T extends SyncNodeRecordMetadata>(db: DbPort, left: T, right: T) {
  const base = await loadTopicTextConflictMetadata(db, left, right);
  if (!base) return null;
  const leftUnchanged = mainSelectionId(left) === base.selection_id;
  const rightUnchanged = mainSelectionId(right) === base.selection_id;
  return leftUnchanged === rightUnchanged ? null : leftUnchanged ? right : left;
}
