import type { DbPort } from '../sync/dbPort.js';

import { framedSyncNodeInventorySql } from './framedSyncInventoryProjectionSql.js';
import { dropFramedSyncInventoryTriggers, FRAMED_SYNC_INVENTORY_TRIGGERS } from './framedSyncInventorySchema.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';

function statements() {
  const drops = dropFramedSyncInventoryTriggers();
  const rebuild = framedSyncNodeInventorySql(
    "SELECT object_id FROM sync_object_state WHERE object_type = 'node'").split(';').filter(sql => sql.trim());
  return [...drops, 'DELETE FROM framed_sync_node_digest', ...rebuild, ...FRAMED_SYNC_INVENTORY_TRIGGERS];
}

export function migrateMissingCurrentVersionInventory(db: DatabaseMigrationTarget) {
  for (const sql of statements()) db.exec(sql);
}

export async function migrateCompanionMissingCurrentVersionInventory(db: DbPort) {
  for (const sql of statements()) await db.run(sql);
}
