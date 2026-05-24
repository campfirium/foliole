import type { DatabaseDriver } from './driver.js';
import { deleteMissingNodeOrderRows, filterExistingOrderIds } from './folderOrderRows.js';
import { ensureSpecialRootNodesForOrder } from './nodeMutationSpecialRoots.js';

export function rewriteExistingNodeOrder(driver: DatabaseDriver, nodeIds: string[]): string[] {
  const deleteOrderStatement = driver.prepare('DELETE FROM node_order');
  const insertOrderStatement = driver.prepare('INSERT INTO node_order (node_id, position) VALUES (?, ?)');
  const orderedNodeIds = filterExistingOrderIds(driver, nodeIds);

  ensureSpecialRootNodesForOrder(driver, orderedNodeIds);
  deleteMissingNodeOrderRows(driver);
  deleteOrderStatement.run();
  for (let index = 0; index < orderedNodeIds.length; index += 1) {
    const nodeId = orderedNodeIds[index];
    if (nodeId !== undefined) {
      insertOrderStatement.run([nodeId, index]);
    }
  }
  return orderedNodeIds;
}

export function replaceNodeOrder(driver: DatabaseDriver, nodeIds: string[]): void {
  driver.transaction(() => {
    rewriteExistingNodeOrder(driver, nodeIds);
  });
}
