import type { DatabaseDriver } from './driver.js';

export function filterExistingOrderIds(driver: DatabaseDriver, nodeIds: string[]) {
  if (nodeIds.length === 0) {
    return [];
  }
  const placeholders = nodeIds.map(() => '?').join(', ');
  const rows = driver.queryAll<{ id: string }>(
    `SELECT id FROM nodes WHERE id IN (${placeholders})`,
    nodeIds
  );
  const existingIds = new Set(rows.map((row) => row.id));
  return nodeIds.filter((nodeId) => existingIds.has(nodeId));
}

export function deleteMissingNodeOrderRows(driver: DatabaseDriver) {
  driver.execute(
    `DELETE FROM node_order
     WHERE node_id NOT IN (SELECT id FROM nodes)`
  );
}
