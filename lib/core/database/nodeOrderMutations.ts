import { collectParentOrderBodiesWithDriver } from '../sync/parentOrderBodyRetention.js';
import { restoreParentOrderSnapshot } from '../sync/syncVersionedParentOrderMerge.js';

import type { DatabaseDriver } from './driver.js';
import { ensureSpecialRootNodesForOrder } from './nodeMutationSpecialRoots.js';
import {
  parentOrderId, readOrderMembers, readParentChildOrders, writeParentChildOrder
} from './parentChildOrder.js';
import { recordLocalParentOrderVersion } from './parentOrderVersionMutations.js';
import { requireDatabaseHostName } from './syncHostIdentity.js';
import { computeSyncContentHash, upsertSyncObjectState } from './syncState.js';

function persistParentOrder(driver: DatabaseDriver, parentId: string, before: string[],
  childIds: string[], now: string, hostName: string, kind: 'membership' | 'user') {
  driver.transaction(() => {
    const childIdsJson = JSON.stringify(childIds);
    const versionId = recordLocalParentOrderVersion(driver, { before, createdAt: now,
      kind, order: childIds, parentId });
    writeParentChildOrder(driver, parentId, childIds, now);
    upsertSyncObjectState(driver, {
      objectType: 'parent_child_order', objectId: parentId,
      currentVersionId: versionId,
      contentHash: computeSyncContentHash('parent_child_order', { parent_id: parentId, child_ids_json: childIdsJson }),
      lastModifiedByHostName: hostName, updatedAt: now, syncDirty: true
    });
    collectParentOrderBodiesWithDriver(driver, parentId);
  });
}

export function ensureNodeParentMembership(driver: DatabaseDriver, nodeId: string) {
  const node = driver.queryOne<{ parent_id: string | null }>('SELECT parent_id FROM nodes WHERE id = ?', [nodeId]);
  if (!node) return;
  const targetParent = parentOrderId(node.parent_id);
  const orders = readParentChildOrders(driver);
  const changes = new Map<string, string[]>();
  for (const [parentId, childIds] of orders) {
    if (parentId !== targetParent && childIds.includes(nodeId)) {
      changes.set(parentId, childIds.filter((id) => id !== nodeId));
    }
  }
  const targetOrder = orders.get(targetParent) ?? [];
  if (!targetOrder.includes(nodeId)) changes.set(targetParent, [...targetOrder, nodeId]);
  if (changes.size === 0) return;
  const now = new Date().toISOString();
  const hostName = requireDatabaseHostName(driver);
  for (const [parentId, childIds] of changes) persistParentOrder(driver, parentId,
    orders.get(parentId) ?? [], childIds, now, hostName, 'membership');
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
    persistParentOrder(driver, parentId, orders.get(parentId) ?? [], next, now, hostName, 'user');
  }
  return nodeIds.filter((id) => byId.has(id));
}

export function replaceNodeOrder(driver: DatabaseDriver, nodeIds: string[]): void {
  driver.transaction(() => {
    rewriteExistingNodeOrder(driver, nodeIds);
  });
}

/** Restore a saved arrangement as a new user edit against current parent membership. */
export function restoreSavedParentOrder(driver: DatabaseDriver, input: {
  hostName: string;
  parentId: string;
  updatedAt: string;
  versionId: string;
}) {
  return driver.transaction(() => {
    const saved = driver.queryOne<{ parent_id: string; child_ids_json: string }>(
      `SELECT parent_id, child_ids_json FROM parent_order_versions WHERE version_id = ?`,
      [input.versionId]);
    if (saved?.parent_id !== input.parentId) throw new Error('sync_parent_order_snapshot_missing');
    if (saved.child_ids_json === 'null') throw new Error('sync_parent_order_body_unavailable');
    const current = readParentChildOrders(driver).get(input.parentId) ?? [];
    const members = readOrderMembers(driver).filter((row) =>
      !row.deleted_at && parentOrderId(row.parent_id) === input.parentId);
    const membership = new Set(members.map((row) => row.id));
    const names = new Map(driver.queryAll<{ id: string; title: string }>(`SELECT id, title
      FROM nodes WHERE id IN (SELECT value FROM json_each(?))`,
    [JSON.stringify([...membership])]).map((row) => [row.id, row.title]));
    const compareAdded = (a: string, b: string) => (names.get(a) ?? '').localeCompare(
      names.get(b) ?? '', 'zh-CN', { numeric: true }) || (a < b ? -1 : a > b ? 1 : 0);
    const order = restoreParentOrderSnapshot(JSON.parse(saved.child_ids_json) as string[],
      current, membership, compareAdded);
    if (JSON.stringify(order) === JSON.stringify(current)) return false;
    persistParentOrder(driver, input.parentId, current, order, input.updatedAt,
      input.hostName, 'user');
    return true;
  });
}
