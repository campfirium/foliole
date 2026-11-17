import { INVALIDATE_ALL_SYNC_DIGESTS } from './framedSyncDigestSchema.js';
import { TOMBSTONE_DIRECT_STATE_TYPES_SQL } from './nodeChildStateSql.js';

const deletedNodes = `SELECT tomb.node_id FROM node_sync_tombstones tomb
  WHERE NOT EXISTS (SELECT 1 FROM nodes WHERE id = tomb.node_id)`;

export const RETIRE_COVERED_NODE_CHILD_STATE = [
  `DELETE FROM parent_order_sources WHERE parent_id IN (${deletedNodes})`,
  `DELETE FROM sync_object_state WHERE object_type IN (${TOMBSTONE_DIRECT_STATE_TYPES_SQL})
    AND object_id IN (${deletedNodes})`,
  `DELETE FROM sync_object_state WHERE object_type = 'node_text_alternative' AND object_id IN (
    SELECT object_id FROM sync_node_child_owners WHERE object_type = 'node_text_alternative'
      AND node_id IN (${deletedNodes})
  )`,
  `DELETE FROM sync_node_child_owners WHERE object_type = 'node_text_alternative' AND node_id IN (${deletedNodes})`,
  INVALIDATE_ALL_SYNC_DIGESTS
] as const;
