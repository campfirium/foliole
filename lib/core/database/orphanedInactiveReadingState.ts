import { SNAPSHOT_VISIBLE_NODES_CTE_SQL } from './workspaceVisibleNodesSql.js';

// A missing reading payload cannot be sent; an inactive node owns its retirement.
// Explicit reading deletion records remain available to the existing sync protocol.
export const ORPHANED_INACTIVE_READING_STATE_QUERY = `${SNAPSHOT_VISIBLE_NODES_CTE_SQL}
  SELECT object_id FROM sync_object_state
  WHERE object_type = 'node_reading' AND deleted_at IS NULL
    AND object_id NOT IN (SELECT id FROM visible_nodes)
    AND NOT EXISTS (SELECT 1 FROM node_reading WHERE node_id = object_id)`;

export const RETIRE_ORPHANED_INACTIVE_READING_STATE_SQL = `DELETE FROM sync_object_state
  WHERE object_type = 'node_reading' AND object_id IN (${ORPHANED_INACTIVE_READING_STATE_QUERY})`;
