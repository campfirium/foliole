import { z } from 'zod';

import { currentParentOrderHash, parseParentOrderSources, projectCurrentParentOrder } from '../sync/currentParentOrder.js';
import type { DbPort, DbRow } from '../sync/dbPort.js';
import type { DbParams } from '../sync/dbPort.js';

import { CURRENT_PARENT_ORDER_SCHEMA, PARENT_ORDER_MATERIALIZE_SQL, PARENT_ORDER_SOURCE_WRITE_SQL } from './currentParentOrderSchema.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { NEXT_SYNC_STATE_SEQ_SQL } from './syncStateSequenceSchemaStatements.js';

const rowsSchema = z.array(z.record(z.string(), z.unknown()));
const ordersSql = 'SELECT parent_id, child_ids_json FROM parent_child_order ORDER BY parent_id';
const membersSql = `SELECT id, title, created_at AS createdAt,
  COALESCE(parent_id, 'parent-child-order:root') AS parentId FROM nodes`;
const now = '1970-01-01T00:00:00.000Z';

interface ParentOrderUpgradeStatement { sql: string; params: DbParams; }
const cleanupSql = [
  "DELETE FROM sync_object_state WHERE object_type IN ('order_version', 'parent_order_position')",
  'DROP TABLE IF EXISTS parent_order_heads', 'DROP TABLE IF EXISTS parent_order_member_positions',
  'DROP TABLE IF EXISTS parent_order_versions', 'DELETE FROM parent_order_projection_pending'
];

function seedPlan(orderRows: DbRow[], memberRows: DbRow[]) {
  const orders = z.array(z.object({ parent_id: z.string(), child_ids_json: z.string() })).parse(orderRows);
  const members = z.array(z.object({ id: z.string(), title: z.string(), createdAt: z.string(), parentId: z.string() })).parse(memberRows);
  const authorId = `initial-${globalThis.crypto.randomUUID()}`;
  const membersByParent = new Map<string, typeof members>();
  for (const member of members) {
    const group = membersByParent.get(member.parentId) ?? [];
    group.push(member);
    membersByParent.set(member.parentId, group);
  }
  const statements: ParentOrderUpgradeStatement[] = [];
  for (const row of orders) {
    const current = parseParentOrderSources([{ authorId, counter: 0, childIds: JSON.parse(row.child_ids_json) }]);
    statements.push({ sql: PARENT_ORDER_SOURCE_WRITE_SQL,
      params: [row.parent_id, authorId, 0, row.child_ids_json] });
    const order = projectCurrentParentOrder(current, membersByParent.get(row.parent_id) ?? []);
    statements.push({ sql: PARENT_ORDER_MATERIALIZE_SQL, params: [row.parent_id, JSON.stringify(order), now] });
    statements.push({ sql: `INSERT INTO sync_object_state
      (object_type, object_id, state_seq, current_version_id, content_hash, last_modified_by_host_name, updated_at, deleted_at, sync_dirty)
      VALUES ('parent_child_order', ?, ${NEXT_SYNC_STATE_SEQ_SQL}, NULL, ?, 'initial-order', ?, NULL, 1)
      ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
        current_version_id = NULL, content_hash = excluded.content_hash, deleted_at = NULL, sync_dirty = 1`,
    params: [row.parent_id, currentParentOrderHash(row.parent_id, current), now] });
  }
  return statements;
}

/** The schema transaction seeds the current order; retirement separately validates old immutable inputs. */
export function migrateCurrentParentOrders(sqlite: DatabaseMigrationTarget) {
  for (const sql of CURRENT_PARENT_ORDER_SCHEMA) sqlite.exec(sql);
  const statements = seedPlan(rowsSchema.parse(sqlite.prepare(ordersSql).all()), rowsSchema.parse(sqlite.prepare(membersSql).all()));
  for (const statement of statements) sqlite.prepare(statement.sql).run(...statement.params);
  for (const sql of cleanupSql) sqlite.exec(sql);
}

export async function migrateCompanionCurrentParentOrders(port: DbPort) {
  for (const sql of CURRENT_PARENT_ORDER_SCHEMA) await port.run(sql);
  const statements = seedPlan(await port.query(ordersSql), await port.query(membersSql));
  for (const statement of statements) await port.run(statement.sql, statement.params);
  for (const sql of cleanupSql) await port.run(sql);
}
