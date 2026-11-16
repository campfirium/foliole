import { saveLocalCurrentParentOrder } from './currentParentOrderStore.js';
import type { DatabaseDriver } from './driver.js';
import { ensureSpecialRootNodesForOrder } from './nodeMutationSpecialRoots.js';
import { parentOrderId, readParentChildOrder } from './parentChildOrder.js';
import { requireDatabaseHostName } from './syncHostIdentity.js';

export function ensureNodeParentMembership(driver: DatabaseDriver, nodeId: string, placement?: 'first') {
  ensureNodesParentMembership(driver, [nodeId], placement);
}

/** Same result as placing each node in turn, but writes every touched parent order once. */
export function ensureNodesParentMembership(driver: DatabaseDriver, nodeIds: string[], placement?: 'first') {
  if (nodeIds.length === 0) return;
  const nodes = driver.queryAll<{ id: string; parent_id: string | null }>(
    'SELECT id, parent_id FROM nodes WHERE id IN (SELECT value FROM json_each(?))', [JSON.stringify(nodeIds)]);
  const parentById = new Map(nodes.map(node => [node.id, node.parent_id]));
  const entrants = new Map<string | null, string[]>();
  for (const nodeId of new Set(nodeIds)) {
    const parentId = parentById.get(nodeId);
    if (parentId !== undefined) {
      const children = entrants.get(parentId) ?? [];
      children.push(nodeId);
      entrants.set(parentId, children);
    }
  }
  for (const [parentId, children] of entrants) {
    const { childIds: previousChildIds } = readParentChildOrder(driver, parentId, new Set(children));
    saveLocalCurrentParentOrder(driver, { parentId: parentOrderId(parentId), previousChildIds,
      childIds: placement === 'first' ? [...children].reverse().concat(previousChildIds) : previousChildIds.concat(children),
      now: new Date().toISOString(), hostName: requireDatabaseHostName(driver) });
  }
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

/** Reorders visible children of one parent, retaining hidden slots and unrequested siblings. */
export function rewriteParentChildOrder(driver: DatabaseDriver, parentNodeId: string | null, nodeIds: string[]) {
  driver.transaction(() => {
    const { childIds, byId } = readParentChildOrder(driver, parentNodeId);
    const requested = [...new Set(nodeIds)].filter((id) => byId.has(id) && !byId.get(id)!.deleted_at);
    const listed = new Set(requested);
    const hidden = new Set(childIds.filter((id) => byId.get(id)!.deleted_at));
    const unlisted = childIds.filter((id) => !listed.has(id) && !hidden.has(id));
    saveLocalCurrentParentOrder(driver, { parentId: parentOrderId(parentNodeId),
      previousChildIds: childIds,
      childIds: retainHiddenSlots(childIds, [...requested, ...unlisted], hidden),
      now: new Date().toISOString(), hostName: requireDatabaseHostName(driver) });
  });
}

export function rewriteExistingNodeOrder(driver: DatabaseDriver, nodeIds: string[]): string[] {
  ensureSpecialRootNodesForOrder(driver, nodeIds);
  if (!nodeIds.length) return [];
  const nodes = driver.queryAll<{ id: string; parent_id: string | null; deleted_at: string | null }>(
    'SELECT id, parent_id, deleted_at FROM nodes WHERE id IN (SELECT value FROM json_each(?))', [JSON.stringify(nodeIds)]);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const requested = new Map<string | null, string[]>();
  for (const nodeId of nodeIds) {
    const member = byId.get(nodeId);
    if (!member || member.deleted_at) continue;
    const ids = requested.get(member.parent_id) ?? [];
    ids.push(nodeId);
    requested.set(member.parent_id, ids);
  }
  for (const [parentId, ids] of requested) rewriteParentChildOrder(driver, parentId, ids);
  return nodeIds.filter(id => byId.has(id));
}

export function replaceNodeOrder(driver: DatabaseDriver, nodeIds: string[]): void {
  driver.transaction(() => {
    rewriteExistingNodeOrder(driver, nodeIds);
  });
}
