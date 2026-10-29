import { sortManualFolderNodes } from '../nodes/manualFolderOrder.js';
import { restoreDeletedChildOrder, type DeletedChildParentOrder } from '../nodes/restoreDeletedChildOrder.js';
import { isFixedStructureRoot } from '../nodes/structureMoveOrder.js';

import { saveLocalCurrentParentOrder } from './currentParentOrderStore.js';
import type { DatabaseDriver } from './driver.js';
import { readMoveParentOrder } from './nodeMoveStructure.js';
import { parentOrderId } from './parentChildOrder.js';
import { requireDatabaseHostName } from './syncHostIdentity.js';

/** Restore only the requested members' positions using the transaction's current parent facts. */
export function restoreDeletedParentOrders(
  driver: DatabaseDriver, nodeIds: string[], orders: DeletedChildParentOrder[]
) {
  const targets = new Set(nodeIds);
  if (nodeIds.some(isFixedStructureRoot)) throw new Error('invalid_restore_order_target');
  const covered = new Set<string>();
  const manualParentOrders: Array<{ parentNodeId: string; childIds: string[] }> = [];
  const now = new Date().toISOString();
  const hostName = requireDatabaseHostName(driver);
  if (new Set(orders.map(order => order.parentNodeId)).size !== orders.length) throw new Error('invalid_restore_orders');
  for (const order of orders) {
    const current = readMoveParentOrder(driver, order.parentNodeId);
    if (new Set(order.childIds).size !== order.childIds.length) throw new Error('invalid_restore_order_members');
    for (const id of order.childIds.filter(id => targets.has(id))) {
      if (!current.byId.has(id) || covered.has(id)) throw new Error('restore_parent_changed');
      covered.add(id);
    }
    const childIds = restoreDeletedChildOrder(current.childIds, order.childIds, targets);
    saveLocalCurrentParentOrder(driver, { parentId: parentOrderId(order.parentNodeId), childIds, now, hostName });
    const manual = order.parentNodeId && order.manualChildIds ? restoreManualOrder(driver, order, targets) : null;
    if (manual) manualParentOrders.push(manual);
  }
  if (covered.size !== targets.size) throw new Error('incomplete_restore_orders');
  return manualParentOrders;
}

function restoreManualOrder(driver: DatabaseDriver, order: DeletedChildParentOrder, targets: Set<string>) {
  const parent = driver.queryOne<{ kind: string; manual_child_order: string | null }>(
    'SELECT kind, manual_child_order FROM nodes WHERE id = ?', [order.parentNodeId]);
  if (parent?.kind !== 'folder' || parent.manual_child_order === null) return null;
  const members = driver.queryAll<{ id: string; title: string }>('SELECT id, title FROM nodes WHERE parent_id = ?', [order.parentNodeId]);
  const current = sortManualFolderNodes(members, JSON.parse(parent.manual_child_order) as string[]).map(node => node.id);
  return { parentNodeId: order.parentNodeId!, childIds: restoreDeletedChildOrder(current, order.manualChildIds!, targets) };
}
