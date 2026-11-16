import { parseParentOrderSources, projectCurrentParentOrder, type ParentOrderSource } from '../sync/currentParentOrder.js';
import type { DbPort } from '../sync/dbPort.js';
import { compareUtf8Text } from '../sync/syncFactKeyOrder.js';

import { readCurrentParentOrder } from './currentParentOrderStore.js';
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

/** The orders of the given parents plus every other stored order that still lists one of the nodes, in table order. */
export function readOrdersAroundNodes(driver: DatabaseDriver, parentIds: string[], nodeIds: string[]) {
  const rows = driver.queryAll<ChildOrderRow>(`SELECT parent_id, child_ids_json FROM parent_child_order
    WHERE parent_id IN (SELECT value FROM json_each(?)) OR parent_id IN (
      SELECT parent_id FROM parent_child_order_members WHERE child_id IN (SELECT value FROM json_each(?)))
    ORDER BY rowid`, [JSON.stringify(parentIds), JSON.stringify(nodeIds)]);
  return new Map(rows.map((row) => [row.parent_id, JSON.parse(row.child_ids_json) as string[]]));
}

/** Reads the current order and membership of one parent, including hidden slots. */
export function readParentChildOrder(driver: DatabaseDriver, parentNodeId: string) {
  return driver.transaction(tx => {
    const members = tx.queryAll<NodeOrderMember & { title: string; createdAt: string }>(
      'SELECT id, parent_id, title, created_at, created_at AS createdAt, deleted_at FROM nodes WHERE parent_id = ?',
      [parentNodeId]);
    const byId = new Map(members.map((member) => [member.id, member]));
    return { childIds: readCurrentParentOrder(tx, parentNodeId, members), byId };
  });
}

export interface WorkspaceOrderMember extends NodeOrderMember { title: string }
const WORKSPACE_ORDER_MEMBERS_SQL = 'SELECT id, parent_id, title, created_at, deleted_at FROM nodes';
export const WORKSPACE_ORDER_SOURCES_SQL = `SELECT parent_id, author_id AS authorId, counter, child_ids_json
  FROM parent_order_sources ORDER BY parent_id, author_id`;

interface WorkspaceOrderSourceRow extends ChildOrderRow { authorId: string; counter: number }

export function readOrderMembers(driver: DatabaseDriver) {
  return driver.queryAll<WorkspaceOrderMember>(WORKSPACE_ORDER_MEMBERS_SQL);
}

export function loadDerivedNodeOrder(driver: DatabaseDriver, members?: WorkspaceOrderMember[]) {
  return driver.transaction(tx => projectWorkspaceOrder(members ?? readOrderMembers(tx),
    tx.queryAll<WorkspaceOrderSourceRow>(WORKSPACE_ORDER_SOURCES_SQL)));
}

export function loadDerivedNodeOrderWithDbPort(port: DbPort, members?: WorkspaceOrderMember[], visibleRooted = false) {
  return port.transaction(async tx => projectWorkspaceOrder(members ?? await tx.query<WorkspaceOrderMember>(WORKSPACE_ORDER_MEMBERS_SQL),
    await tx.query<WorkspaceOrderSourceRow>(WORKSPACE_ORDER_SOURCES_SQL), visibleRooted));
}

function projectWorkspaceOrder(members: WorkspaceOrderMember[], rows: WorkspaceOrderSourceRow[], visibleRooted = false) {
  const sources = new Map<string, ParentOrderSource[]>();
  for (const { parent_id, authorId, counter, child_ids_json } of rows) {
    const group = sources.get(parent_id) ?? [];
    group.push({ authorId, counter, childIds: JSON.parse(child_ids_json) });
    sources.set(parent_id, group);
  }
  return walkWorkspaceOrder(members, (parentId, children) => {
    const group = sources.get(parentId);
    if (!group?.length) return children.sort(compareMembers);
    const byId = new Map(children.map(child => [child.id, child]));
    return projectCurrentParentOrder(parseParentOrderSources(group), children.map(child => ({
      id: child.id, title: child.title, createdAt: child.created_at
    }))).map(id => byId.get(id)!);
  }, visibleRooted);
}

function compareMembers(left: NodeOrderMember, right: NodeOrderMember) {
  return compareUtf8Text(left.created_at, right.created_at) || compareUtf8Text(left.id, right.id);
}

export function projectParentChildOrder(
  members: NodeOrderMember[],
  orders: ReadonlyMap<string, readonly string[]>
) {
  const byId = new Map(members.map((member) => [member.id, member]));
  return walkWorkspaceOrder(members, (parentId, children) => {
    const ordered = (orders.get(parentId) ?? [])
      .map((id) => byId.get(id))
      .filter((member): member is NodeOrderMember => Boolean(member && parentOrderId(member.parent_id) === parentId));
    const listed = new Set(ordered.map((member) => member.id));
    return [...ordered, ...children.filter((child) => !listed.has(child.id)).sort(compareMembers)];
  });
}

function walkWorkspaceOrder<T extends NodeOrderMember>(
  members: T[], orderChildren: (parentId: string, children: T[]) => T[], visibleRooted = false
) {
  const childrenByParent = new Map<string, T[]>();
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
    for (const member of orderChildren(parentId, children)) {
      if (visited.has(member.id) || (visibleRooted && member.deleted_at)) continue;
      visited.add(member.id);
      result.push(member.id);
      walk(member.id);
    }
  };
  walk(ROOT_CHILD_ORDER_ID);
  if (visibleRooted) return result;
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
