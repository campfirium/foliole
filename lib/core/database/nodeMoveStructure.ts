import type { NativeMoveNodesArgs } from '../../platform/nativeMoveContract.js';
import { canCreateChildNodeKind } from '../nodes/folderTopicItemCommands.js';
import type { NodeKind } from '../nodes/nodeKind.js';
import { isFixedStructureRoot } from '../nodes/structureMoveOrder.js';

import { projectStoredParentOrder, saveLocalCurrentParentOrder } from './currentParentOrderStore.js';
import type { DatabaseDriver } from './driver.js';
import { ensureSpecialRootNodesForInput } from './nodeMutationSpecialRoots.js';
import { parentOrderId } from './parentChildOrder.js';
import { HOME_NODE_ID, INBOX_NODE_ID, TRASH_NODE_ID, VIRTUAL_ROOT_NODE_ID } from './specialNodeIds.js';
import { requireDatabaseHostName } from './syncHostIdentity.js';

export interface MoveStructureNode {
  [key: string]: unknown;
  id: string; parent_id: string | null; kind: NodeKind; deleted_at: string | null;
  updated_at: string;
}

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function readMoveParentOrder(driver: DatabaseDriver, parentNodeId: string | null) {
  const parentId = parentOrderId(parentNodeId);
  if (driver.queryOne('SELECT parent_id FROM parent_order_projection_pending WHERE parent_id = ?', [parentId])) {
    projectStoredParentOrder(driver, parentId, new Date().toISOString());
  }
  const rows = driver.queryAll<MoveStructureNode>(
    'SELECT id, parent_id, kind, deleted_at, updated_at FROM nodes WHERE parent_id IS ?', [parentNodeId]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const stored = driver.queryOne<{ child_ids_json: string }>(
    'SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?', [parentId]);
  const childIds = (stored ? JSON.parse(stored.child_ids_json) as string[] : []).filter((id) => byId.has(id));
  if (childIds.length !== rows.length) throw new Error('move_parent_projection_incomplete');
  return { parentNodeId, childIds, visibleIds: childIds.filter((id) => !byId.get(id)!.deleted_at &&
    (parentNodeId !== null || !isFixedStructureRoot(id))), byId };
}

function requireMoveNode(driver: DatabaseDriver, id: string) {
  const node = driver.queryOne<MoveStructureNode>(
    'SELECT id, parent_id, kind, deleted_at, updated_at FROM nodes WHERE id = ?', [id]);
  if (!node || node.deleted_at) throw new Error('move_node_unavailable');
  return node;
}

export function validateMoveStructure(driver: DatabaseDriver, input: NativeMoveNodesArgs) {
  if (!input.nodes.length || new Set(input.nodes.map((node) => node.nodeId)).size !== input.nodes.length) {
    throw new Error('invalid_move_roots');
  }
  const roots = input.nodes.map((patch) => {
    ensureSpecialRootNodesForInput(driver, patch);
    const node = requireMoveNode(driver, patch.nodeId);
    if ([HOME_NODE_ID, INBOX_NODE_ID, TRASH_NODE_ID, VIRTUAL_ROOT_NODE_ID].includes(node.id) ||
        node.parent_id !== patch.expectedParentNodeId) throw new Error('move_structure_conflict');
    const parent = patch.parentNodeId ? requireMoveNode(driver, patch.parentNodeId) : null;
    if (parent?.id === HOME_NODE_ID || parent?.id === TRASH_NODE_ID ||
        !canCreateChildNodeKind(parent?.kind ?? null, node.kind)) {
      throw new Error('invalid_move_parent');
    }
    const visited = new Set([node.id]);
    let ancestor = parent;
    while (ancestor) {
      if (visited.has(ancestor.id)) throw new Error('invalid_move_cycle');
      visited.add(ancestor.id);
      const proposed = input.nodes.find((root) => root.nodeId === ancestor!.id);
      const parentId = proposed ? proposed.parentNodeId : ancestor.parent_id;
      ancestor = parentId ? requireMoveNode(driver, parentId) : null;
    }
    return node;
  });
  const parents = new Set(input.nodes.flatMap((node) => [node.expectedParentNodeId, node.parentNodeId]));
  if (parents.size !== input.parentOrders.length ||
      new Set(input.parentOrders.map((order) => order.parentNodeId)).size !== parents.size ||
      input.parentOrders.some((order) => !parents.has(order.parentNodeId))) throw new Error('invalid_move_orders');
  const orders = input.parentOrders.map((order) => {
    const current = readMoveParentOrder(driver, order.parentNodeId);
    if (!sameIds(current.visibleIds, order.expectedChildIds)) throw new Error('move_structure_conflict');
    const leaving = new Set(input.nodes.filter((node) => node.parentNodeId !== order.parentNodeId)
      .map((node) => node.nodeId));
    const members = new Set([...current.visibleIds.filter((id) => !leaving.has(id)),
      ...input.nodes.filter((node) => node.parentNodeId === order.parentNodeId).map((node) => node.nodeId)]);
    if (new Set(order.childIds).size !== order.childIds.length || order.childIds.length !== members.size ||
        order.childIds.some((id) => !members.has(id))) throw new Error('invalid_move_members');
    return current;
  });
  return { roots, orders };
}

export function writeMoveStructure(
  driver: DatabaseDriver, input: NativeMoveNodesArgs, before: ReturnType<typeof validateMoveStructure>
) {
  const hostName = requireDatabaseHostName(driver);
  for (const node of input.nodes) {
    if (node.parentNodeId === node.expectedParentNodeId) continue;
    driver.execute(`UPDATE nodes SET parent_id = ?, updated_at = ?, last_modified_by_host_name = ?, sync_dirty = 1
      WHERE id = ?`, [node.parentNodeId, node.updatedAt, hostName, node.nodeId]);
  }
  for (const [index, order] of input.parentOrders.entries()) {
    const previous = before.orders[index]!;
    const target = [...order.childIds];
    const retained = previous.childIds.filter((id) => !input.nodes.some((node) =>
      node.nodeId === id && node.parentNodeId !== order.parentNodeId));
    const childIds = retained.flatMap((id) => previous.byId.get(id)?.deleted_at ||
      (order.parentNodeId === null && isFixedStructureRoot(id)) ? [id] : target.splice(0, 1));
    childIds.push(...target);
    saveLocalCurrentParentOrder(driver, { parentId: parentOrderId(order.parentNodeId), childIds,
      now: new Date().toISOString(), hostName });
  }
}
