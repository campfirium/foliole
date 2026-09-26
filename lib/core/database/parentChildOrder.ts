import type { DatabaseDriver, DatabaseRow } from './driver.js';

export const ROOT_CHILD_ORDER_ID = 'parent-child-order:root';

interface ChildOrderRow extends DatabaseRow {
  parent_id: string;
  child_ids_json: string;
}

interface NodeOrderMember extends DatabaseRow {
  id: string;
  parent_id: string | null;
  created_at: string;
  deleted_at: string | null;
}

export function parentOrderId(parentId: string | null) {
  return parentId ?? ROOT_CHILD_ORDER_ID;
}

export function readParentChildOrders(driver: DatabaseDriver) {
  const rows = driver.queryAll<ChildOrderRow>('SELECT parent_id, child_ids_json FROM parent_child_order');
  return new Map(rows.map((row) => [row.parent_id, JSON.parse(row.child_ids_json) as string[]]));
}

export function readOrderMembers(driver: DatabaseDriver) {
  return driver.queryAll<NodeOrderMember>('SELECT id, parent_id, created_at, deleted_at FROM nodes');
}

export function loadDerivedNodeOrder(driver: DatabaseDriver) {
  return projectParentChildOrder(readOrderMembers(driver), readParentChildOrders(driver));
}

function compareMembers(left: NodeOrderMember, right: NodeOrderMember) {
  return left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id);
}

export function projectParentChildOrder(
  members: NodeOrderMember[],
  orders: ReadonlyMap<string, readonly string[]>
) {
  const byId = new Map(members.map((member) => [member.id, member]));
  const childrenByParent = new Map<string, NodeOrderMember[]>();
  for (const member of members) {
    const parentId = parentOrderId(member.parent_id);
    const children = childrenByParent.get(parentId) ?? [];
    children.push(member);
    childrenByParent.set(parentId, children);
  }
  const result: string[] = [];
  const visited = new Set<string>();
  const walk = (parentId: string) => {
    const children = childrenByParent.get(parentId) ?? [];
    const ordered = (orders.get(parentId) ?? [])
      .map((id) => byId.get(id))
      .filter((member): member is NodeOrderMember => Boolean(member && parentOrderId(member.parent_id) === parentId));
    const listed = new Set(ordered.map((member) => member.id));
    for (const member of [...ordered, ...children.filter((child) => !listed.has(child.id)).sort(compareMembers)]) {
      if (visited.has(member.id)) continue;
      visited.add(member.id);
      result.push(member.id);
      walk(member.id);
    }
  };
  walk(ROOT_CHILD_ORDER_ID);
  for (const member of [...members].sort(compareMembers)) {
    if (visited.has(member.id)) continue;
    result.push(member.id);
    visited.add(member.id);
    walk(member.id);
  }
  return result;
}

export function writeParentChildOrder(driver: DatabaseDriver, parentId: string, childIds: string[], updatedAt: string) {
  driver.execute(
    `INSERT INTO parent_child_order (parent_id, child_ids_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(parent_id) DO UPDATE SET child_ids_json = excluded.child_ids_json, updated_at = excluded.updated_at`,
    [parentId, JSON.stringify(childIds), updatedAt]
  );
}
