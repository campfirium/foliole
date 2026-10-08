import type { DbPort } from '../sync/dbPort.js';
import { createOpaqueVersionRef } from '../sync/opaqueSyncRefs.js';
import { publishParentOrderPosition } from '../sync/parentOrderMemberPosition.js';
import { advanceParentOrderHead, insertParentOrderVersion, PARENT_ORDER_BASELINE_TIME,
  parentOrderBaselineVersionId } from '../sync/syncParentOrderVersionStore.js';

import type { DatabaseRow } from './driver.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { recordLocalParentOrderVersion } from './parentOrderVersionMutations.js';

export const PARTITION_ORDERS_SQL = 'SELECT parent_id, child_ids_json FROM parent_child_order';
const STORE = `INSERT INTO parent_child_order (parent_id, child_ids_json, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(parent_id) DO UPDATE SET child_ids_json = excluded.child_ids_json, updated_at = excluded.updated_at`;
type Order = { parent_id: string; child_ids_json: string };
type Change = { parentId: string; before: string[]; order: string[] };

export function partitionMigrationOrderChanges(rows: Order[], moved: Array<{ id: string; parentId: string }>) {
  const original = new Map(rows.map((row) => [row.parent_id, JSON.parse(row.child_ids_json) as string[]]));
  const orders = new Map([...original].map(([id, order]) => [id, [...order]]));
  for (const node of moved) {
    for (const [parentId, order] of orders) {
      if (parentId !== node.parentId && order.includes(node.id)) orders.set(parentId, order.filter((id) => id !== node.id));
    }
    const order = orders.get(node.parentId) ?? [];
    if (!order.includes(node.id)) orders.set(node.parentId, [...order, node.id]);
  }
  return [...orders].flatMap(([parentId, order]): Change[] => {
    const before = original.get(parentId) ?? [];
    return JSON.stringify(before) === JSON.stringify(order) ? [] : [{ parentId, before, order }];
  });
}

/** Existing membership facts do not require an initialized desktop host setting. */
export function writePartitionMigrationOrders(sqlite: DatabaseMigrationTarget, changes: Change[], now: string) {
  const driver = {
    queryOne: <T extends DatabaseRow>(sql: string, params: readonly unknown[] = []) =>
      sqlite.prepare(sql).all(...params)[0] as T | undefined,
    queryAll: <T extends DatabaseRow>(sql: string, params: readonly unknown[] = []) =>
      sqlite.prepare(sql).all(...params) as T[],
    execute: (sql: string, params: readonly unknown[] = []) => {
      sqlite.prepare(sql).run(...params);
    }
  };
  for (const change of changes) {
    recordLocalParentOrderVersion(driver, { ...change, createdAt: now, kind: 'membership' });
    sqlite.prepare(STORE).run(change.parentId, JSON.stringify(change.order), now);
  }
}

async function previousVersion(db: DbPort, change: Change) {
  const [head] = await db.query<{ version_id: string; child_ids_json: string }>(`SELECT head.version_id,
    version.child_ids_json FROM parent_order_heads head JOIN parent_order_versions version
      ON version.version_id = head.version_id WHERE head.parent_id = ?`, [change.parentId]);
  if (head?.child_ids_json === JSON.stringify(change.before)) return head.version_id;
  const versionId = parentOrderBaselineVersionId(change.parentId, change.before);
  await insertParentOrderVersion(db, change.parentId, { versionId, kind: 'baseline',
    order: change.before, parentVersionIds: [] }, PARENT_ORDER_BASELINE_TIME);
  return versionId;
}

export async function writeCompanionPartitionMigrationOrders(db: DbPort, changes: Change[], now: string) {
  for (const change of changes) {
    const parentVersionId = await previousVersion(db, change);
    const versionId = createOpaqueVersionRef(globalThis.crypto.randomUUID());
    await insertParentOrderVersion(db, change.parentId, { versionId, kind: 'membership',
      order: change.order, parentVersionIds: [parentVersionId] }, now);
    await advanceParentOrderHead(db, change.parentId, versionId);
    await publishParentOrderPosition(db, change.parentId);
    await db.run(STORE, [change.parentId, JSON.stringify(change.order), now]);
  }
}
