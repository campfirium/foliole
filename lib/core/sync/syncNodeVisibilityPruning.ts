import { RETIRE_ORPHANED_INACTIVE_READING_STATE_SQL } from '../database/orphanedInactiveReadingState.js';
import { SNAPSHOT_VISIBLE_NODES_CTE_SQL as VISIBLE_NODES_CTE_SQL } from '../database/workspaceVisibleNodesSql.js';

import type { DbPort } from './dbPort.js';

export async function pruneLearningRowsWithoutVisibleNodes(port: DbPort) {
  const removedHostState = await port.run(
    `DELETE FROM node_reading_host_state
     WHERE node_id NOT IN (SELECT id FROM nodes)`
  );
  const removedReading = await port.run(
    `DELETE FROM node_reading
     WHERE node_id NOT IN (SELECT id FROM nodes)`
  );
  const retiredReading = await port.run(RETIRE_ORPHANED_INACTIVE_READING_STATE_SQL);
  const removedReviews = await port.run(
    `${VISIBLE_NODES_CTE_SQL}
     DELETE FROM node_review
     WHERE node_id NOT IN (SELECT id FROM visible_nodes)`
  );
  await port.run(`DELETE FROM sync_object_state INDEXED BY idx_sync_object_state_type_seq
    WHERE object_type IN ('node_reading', 'node_review')
    AND sync_dirty = 0 AND deleted_at IS NULL
    AND ((object_type = 'node_reading' AND NOT EXISTS
      (SELECT 1 FROM node_reading entity WHERE entity.node_id = sync_object_state.object_id))
    OR (object_type = 'node_review' AND NOT EXISTS
      (SELECT 1 FROM node_review entity WHERE entity.node_id = sync_object_state.object_id)))`);
  return removedHostState.changes + removedReading.changes + retiredReading.changes + removedReviews.changes > 0;
}
