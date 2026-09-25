import type { DatabaseDriver } from '../../lib/core/database/driver.js';

export function readNodeOrderPositions(driver: DatabaseDriver) {
  return new Map(driver.queryAll<{ node_id: string; position: number }>(
    'SELECT node_id, position FROM node_order'
  ).map((row) => [row.node_id, row.position]));
}

export function markChangedNodeOrderDirty(
  driver: DatabaseDriver,
  before: ReadonlyMap<string, number>,
  hostName: string
) {
  const after = readNodeOrderPositions(driver);
  const changedIds = new Set([...before.keys(), ...after.keys()]);
  for (const nodeId of changedIds) {
    if (before.get(nodeId) === after.get(nodeId)) continue;
    driver.execute(
      `UPDATE nodes SET last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = ?`,
      [hostName, nodeId]
    );
  }
}
