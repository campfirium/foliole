import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';

const retirement = [
  'DROP TRIGGER IF EXISTS trg_parent_order_node_insert',
  'DROP TRIGGER IF EXISTS trg_parent_order_node_update',
  'DROP TRIGGER IF EXISTS trg_parent_order_node_delete',
  'DROP TABLE IF EXISTS parent_child_order',
  'DROP TABLE IF EXISTS parent_child_order_members',
  'DROP TABLE IF EXISTS parent_order_projection_pending'
];

export function retireParentOrderProjection(db: DatabaseMigrationTarget) {
  for (const sql of retirement) db.exec(sql);
}

export async function retireCompanionParentOrderProjection(db: DbPort) {
  for (const sql of retirement) await db.run(sql);
}
