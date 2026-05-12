import type { DatabaseDriver } from './driver.js';

export function filterFolderOrderIds(driver: DatabaseDriver, nodeIds: string[]) {
  if (nodeIds.length === 0) {
    return [];
  }
  const placeholders = nodeIds.map(() => '?').join(', ');
  const rows = driver.queryAll<{ id: string }>(
    `SELECT id FROM nodes WHERE kind = 'folder' AND id IN (${placeholders})`,
    nodeIds
  );
  const folderIds = new Set(rows.map((row) => row.id));
  return nodeIds.filter((nodeId) => folderIds.has(nodeId));
}

export function deleteNonFolderOrderRows(driver: DatabaseDriver) {
  driver.execute(
    `DELETE FROM node_order
     WHERE node_id NOT IN (SELECT id FROM nodes WHERE kind = 'folder')`
  );
}
