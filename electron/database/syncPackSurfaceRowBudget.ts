import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { SYNC_PACK_PAYLOAD_OBJECT_TYPES } from '../../lib/core/sync/syncPackManifest.js';

import { SYNC_PACK_LEARNING_NODE_OBJECT_TYPES } from './syncPackLearningRows.js';

const nodeTypes = ['node', ...SYNC_PACK_LEARNING_NODE_OBJECT_TYPES].map((type) => `'${type}'`).join(', ');
const payloadTypes = [...SYNC_PACK_PAYLOAD_OBJECT_TYPES].map((type) => `'${type}'`).join(', ');

// Count the surface records which remain after version dependencies are staged.
// This uses SQL counts before materializing payloads; shared blobs count once.
const SURFACE_ROWS_SQL = `WITH RECURSIVE
  changed AS (SELECT object_type, object_id, deleted_at FROM sync_object_state
    WHERE state_seq > ? AND state_seq <= ?),
  lineage(id, parent_id, body_blob_hash, current_version_id) AS (
    SELECT n.id, n.parent_id, n.body_blob_hash, n.current_version_id FROM nodes n JOIN changed c ON c.object_id = n.id
      WHERE c.object_type IN (${nodeTypes})
    UNION SELECT n.id, n.parent_id, n.body_blob_hash, n.current_version_id FROM nodes n JOIN lineage child ON child.parent_id = n.id
    LIMIT ?
  ),
  documents AS (SELECT d.body_blob_hash FROM external_documents d JOIN changed c
    ON c.object_id = d.document_id WHERE c.object_type = 'external_document'),
  selected_group AS (SELECT group_id FROM sync_groups WHERE group_id IN
    (SELECT group_id FROM sync_group_local_state WHERE singleton_id = 1))
  SELECT
    (SELECT COUNT(*) FROM changed) +
    (SELECT COUNT(*) FROM changed WHERE object_type IN (${payloadTypes})) +
    (SELECT COUNT(*) FROM lineage) +
    (SELECT COUNT(*) FROM lineage WHERE current_version_id IS NOT NULL
      AND id NOT IN ('special-inbox', 'special-virtual-root') AND EXISTS
        (SELECT 1 FROM sync_group_local_state WHERE singleton_id = 1 AND state = 'active')) +
    (SELECT COUNT(*) FROM sync_object_state s JOIN lineage n ON n.id = s.object_id
      WHERE s.object_type = 'node' AND NOT EXISTS
        (SELECT 1 FROM changed c WHERE c.object_type = 'node' AND c.object_id = n.id)) +
    (SELECT COUNT(*) FROM documents) +
    (SELECT COUNT(*) FROM content_blobs WHERE hash IN
      (SELECT body_blob_hash FROM lineage UNION SELECT body_blob_hash FROM documents)) +
    (SELECT COUNT(*) FROM selected_group) +
    (SELECT COUNT(*) FROM sync_group_devices WHERE group_id IN (SELECT group_id FROM selected_group)
      AND state IN ('active', 'left')) +
    (SELECT COUNT(*) FROM node_sync_tombstones t JOIN changed c ON c.object_id = t.node_id
      WHERE c.object_type = 'node' AND c.deleted_at IS NOT NULL) +
    1 AS count`;

export function assertSyncPackSurfaceRowBudget(driver: DatabaseDriver, fromStateSeq: number,
  toStateSeq: number, applyRows: number) {
  const count = driver.queryOne<{ count: number }>(SURFACE_ROWS_SQL,
    [fromStateSeq, toStateSeq, applyRows + 1])?.count ?? 0;
  if (count > applyRows) throw new Error('sync_pack_page_preflight_exceeds_budget');
}
