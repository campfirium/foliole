import { saveLocalCurrentParentOrder } from './currentParentOrderStore.js';
import type { DatabaseDriver } from './driver.js';
import { ensureSpecialRootNodesForOrder } from './nodeMutationSpecialRoots.js';
import {
  parentOrderId, readOrderMembers, readOrdersAroundNodes, readParentChildOrders
} from './parentChildOrder.js';
import { requireDatabaseHostName } from './syncHostIdentity.js';

export function ensureNodeParentMembership(driver: DatabaseDriver, nodeId: string) {
  ensureNodesParentMembership(driver, [nodeId]);
}

/** Same result as placing each node in turn, but writes every touched parent order once. */
export function ensureNodesParentMembership(driver: DatabaseDriver, nodeIds: string[]) {
  if (nodeIds.length === 0) return;
  const nodes = driver.queryAll<{ id: string; parent_id: string | null }>(
    'SELECT id, parent_id FROM nodes WHERE id IN (SELECT value FROM json_each(?))', [JSON.stringify(nodeIds)]);
  const parentById = new Map(nodes.map((node) => [node.id, parentOrderId(node.parent_id)]));
  const orders = readOrdersAroundNodes(driver, [...new Set(parentById.values())], [...parentById.keys()]);
  const changes = new Map<string, string[]>();
  for (const nodeId of nodeIds) {
    const targetParent = parentById.get(nodeId);
    if (targetParent !== undefined) placeNodeInOrders(orders, changes, targetParent, nodeId);
  }
  if (changes.size === 0) return;
  const now = new Date().toISOString();
  const hostName = requireDatabaseHostName(driver);
  for (const [parentId, childIds] of changes) saveLocalCurrentParentOrder(driver,
    { parentId, childIds, now, hostName });
}

function placeNodeInOrders(
  orders: Map<string, string[]>, changes: Map<string, string[]>, targetParent: string, nodeId: string
) {
  for (const [parentId, childIds] of orders) {
    if (parentId !== targetParent && childIds.includes(nodeId)) {
      const next = childIds.filter((id) => id !== nodeId);
      orders.set(parentId, next);
      changes.set(parentId, next);
    }
  }
  const targetOrder = orders.get(targetParent) ?? [];
  if (targetOrder.includes(nodeId)) return;
  const next = [...targetOrder, nodeId];
  orders.set(targetParent, next);
  changes.set(targetParent, next);
}

function retainHiddenSlots(existing: string[], visible: string[], hidden: Set<string>) {
  const remaining = [...visible];
  const result: string[] = [];
  for (const nodeId of existing) {
    if (hidden.has(nodeId)) {
      result.push(nodeId);
    } else if (remaining.length > 0) {
      result.push(remaining.shift()!);
    }
  }
  return [...result, ...remaining];
}

export function rewriteExistingNodeOrder(driver: DatabaseDriver, nodeIds: string[]): string[] {
  ensureSpecialRootNodesForOrder(driver, nodeIds);
  const members = readOrderMembers(driver);
  const byId = new Map(members.map((member) => [member.id, member]));
  const orders = readParentChildOrders(driver);
  const requested = new Map<string, string[]>();
  for (const nodeId of nodeIds) {
    const member = byId.get(nodeId);
    if (!member || member.deleted_at) continue;
    const parentId = parentOrderId(member.parent_id);
    requested.set(parentId, [...(requested.get(parentId) ?? []), nodeId]);
  }
  const hostName = requireDatabaseHostName(driver);
  const now = new Date().toISOString();
  for (const parentId of new Set([...orders.keys(), ...requested.keys()])) {
    const existing = (orders.get(parentId) ?? []).filter((id) => {
      const member = byId.get(id);
      return member && parentOrderId(member.parent_id) === parentId;
    });
    const requestedVisible = requested.get(parentId) ?? [];
    const listed = new Set(requestedVisible);
    const hidden = new Set(existing.filter((id) => byId.get(id)?.deleted_at));
    const unlisted = existing.filter((id) => !listed.has(id) && !hidden.has(id));
    const next = retainHiddenSlots(existing, [...requestedVisible, ...unlisted], hidden);
    if (JSON.stringify(next) === JSON.stringify(orders.get(parentId) ?? [])) continue;
    saveLocalCurrentParentOrder(driver, { parentId, childIds: next, now, hostName });
  }
  return nodeIds.filter((id) => byId.has(id));
}

export function replaceNodeOrder(driver: DatabaseDriver, nodeIds: string[]): void {
  driver.transaction(() => {
    rewriteExistingNodeOrder(driver, nodeIds);
  });
}
