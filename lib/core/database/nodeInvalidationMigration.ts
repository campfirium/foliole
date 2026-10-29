import type { DbPort } from '../sync/dbPort.js';

import { CURRENT_PARENT_ORDER_SCHEMA } from './currentParentOrderSchema.js';
import { DAILY_FLOW_LEARNING_TRIGGERS } from './dailyFlowSchema.js';
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

const flowTriggers = [
  ...['nodes', 'node_review', 'node_reading'].flatMap(table => ['insert', 'update', 'delete']
    .map(event => `DROP TRIGGER IF EXISTS daily_flow_${table}_${event}`)),
  ...DAILY_FLOW_LEARNING_TRIGGERS
];

export function migrateMaterialFlowInvalidation(db: DatabaseMigrationTarget) {
  for (const sql of flowTriggers) db.exec(sql);
}

export async function migrateCompanionMaterialFlowInvalidation(db: DbPort) {
  for (const sql of flowTriggers) await db.run(sql);
}
