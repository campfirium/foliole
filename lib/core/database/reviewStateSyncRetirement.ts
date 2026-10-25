import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { migrateCompanionNodeChildInventory, migrateNodeChildInventory } from './nodeChildInventoryMigration.js';

const CLEANUP = [
  "DELETE FROM sync_object_state WHERE object_type = 'node_review'",
  "DELETE FROM sync_node_child_owners WHERE object_type = 'node_review'"
];

/** Retire only rebuildable synchronization state; stored schedules and review facts stay untouched. */
export function retireReviewStateSync(db: DatabaseMigrationTarget) {
  for (const sql of CLEANUP) db.exec(sql);
  migrateNodeChildInventory(db);
}

export async function retireCompanionReviewStateSync(db: DbPort) {
  for (const sql of CLEANUP) await db.run(sql);
  await migrateCompanionNodeChildInventory(db);
}
