import { RETIRE_ORPHANED_INACTIVE_READING_STATE_SQL } from '../database/orphanedInactiveReadingState.js';
import { SNAPSHOT_VISIBLE_NODES_CTE_SQL as VISIBLE_NODES_CTE_SQL } from '../database/workspaceVisibleNodesSql.js';

import type { DbPort } from './dbPort.js';

export async function pruneLearningRowsWithoutVisibleNodes(port: DbPort) {
  await port.run(
    `DELETE FROM node_reading_host_state
     WHERE node_id NOT IN (SELECT id FROM nodes)`
  );
  await port.run(
    `DELETE FROM node_reading
     WHERE node_id NOT IN (SELECT id FROM nodes)`
  );
  await port.run(RETIRE_ORPHANED_INACTIVE_READING_STATE_SQL);
  await port.run(
    `${VISIBLE_NODES_CTE_SQL}
     DELETE FROM node_review
     WHERE node_id NOT IN (SELECT id FROM visible_nodes)`
  );
  await port.run(`DELETE FROM sync_object_state WHERE sync_dirty = 0 AND deleted_at IS NULL
    AND ((object_type = 'node_reading' AND NOT EXISTS
      (SELECT 1 FROM node_reading entity WHERE entity.node_id = sync_object_state.object_id))
    OR (object_type = 'node_review' AND NOT EXISTS
      (SELECT 1 FROM node_review entity WHERE entity.node_id = sync_object_state.object_id)))`);
}
