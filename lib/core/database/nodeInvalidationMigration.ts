import type { DbPort } from '../sync/dbPort.js';

import { CURRENT_PARENT_ORDER_SCHEMA } from './currentParentOrderSchema.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';

const parentOrderTrigger = [
  'DROP TRIGGER IF EXISTS trg_parent_order_node_update', CURRENT_PARENT_ORDER_SCHEMA[4]
];

export function migrateParentOrderInvalidation(db: DatabaseMigrationTarget) {
  for (const sql of parentOrderTrigger) db.exec(sql);
}

export async function migrateCompanionParentOrderInvalidation(db: DbPort) {
  for (const sql of parentOrderTrigger) await db.run(sql);
}
