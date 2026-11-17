import type { DbPort } from '../sync/dbPort.js';

import { framedSyncNodeInventorySql } from './framedSyncInventoryProjectionSql.js';
import { dropFramedSyncInventoryTriggers, FRAMED_SYNC_INVENTORY_TRIGGERS } from './framedSyncInventorySchema.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';

function statements() {
  const affected = `SELECT node_id FROM sync_node_child_owners WHERE object_type = 'import_source'
    UNION SELECT node_id FROM topic_daily_count_entries`;
  return [
    ...dropFramedSyncInventoryTriggers(),
    ...framedSyncNodeInventorySql(affected).split(';').filter(sql => sql.trim()),
    "DELETE FROM sync_node_child_owners WHERE object_type = 'import_source'",
    'DROP INDEX IF EXISTS idx_sync_topic_daily_owner_lookup',
    'DELETE FROM framed_sync_node_digest',
    ...FRAMED_SYNC_INVENTORY_TRIGGERS
  ];
}

export function migrateIndependentImportHistoryInventory(db: DatabaseMigrationTarget) {
  for (const sql of statements()) db.exec(sql);
}

export async function migrateCompanionIndependentImportHistoryInventory(db: DbPort) {
  for (const sql of statements()) await db.run(sql);
}
