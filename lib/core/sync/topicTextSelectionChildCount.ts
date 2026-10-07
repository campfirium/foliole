import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';

export async function topicTextSelectionChildCount(db: DbPort, record: NativeSyncNodeRecord) {
  const selectionId = record.snapshot.text_selection?.version_id ?? record.version_id;
  const [row] = await db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM nodes child
     WHERE child.parent_id = ? AND child.deleted_at IS NULL AND (
       child.anchor_source_version_id IS NULL OR child.anchor_source_version_id IN (?, ?) OR
       EXISTS (SELECT 1 FROM node_sync_versions source WHERE source.version_id = child.anchor_source_version_id
         AND COALESCE(json_extract(source.snapshot_json, '$.text_selection.version_id'), source.version_id) = ?))`,
    [record.object_id, record.version_id, selectionId, selectionId]
  );
  return row?.count ?? 0;
}
