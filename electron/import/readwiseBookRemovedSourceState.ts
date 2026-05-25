import { openDatabaseConnection } from '../database/connection.js';

export function isRemovedReadwiseBookNode(nodeId: string) {
  const row = openDatabaseConnection().driver.queryOne<{ found: number }>(
    `SELECT 1 AS found
     FROM keep_import_items
     WHERE last_node_id = ?
       AND local_node_state = 'locally_deleted'
       AND last_status = 'blocked_deleted'
     LIMIT 1`,
    [nodeId]
  );
  return Boolean(row?.found);
}
