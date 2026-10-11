import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';

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

/** The subsequent current-order migration captures these legacy materialized lists. */
export function writePartitionMigrationOrders(sqlite: DatabaseMigrationTarget, changes: Change[], now: string) {
  for (const change of changes) sqlite.prepare(STORE).run(change.parentId, JSON.stringify(change.order), now);
}

export async function writeCompanionPartitionMigrationOrders(db: DbPort, changes: Change[], now: string) {
  for (const change of changes) await db.run(STORE, [change.parentId, JSON.stringify(change.order), now]);
}
