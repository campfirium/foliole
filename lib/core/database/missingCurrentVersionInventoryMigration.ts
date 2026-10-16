import type { DbPort } from '../sync/dbPort.js';

import { framedSyncNodeInventorySql } from './framedSyncInventoryProjectionSql.js';
import { FRAMED_SYNC_INVENTORY_TRIGGERS } from './framedSyncInventorySchema.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';

function statements() {
  const drops = FRAMED_SYNC_INVENTORY_TRIGGERS.map(sql => {
    const name = /^CREATE TRIGGER IF NOT EXISTS (\w+)/u.exec(sql)?.[1];
    if (!name) throw new Error('framed_sync_inventory_trigger_name_invalid');
    return `DROP TRIGGER IF EXISTS ${name}`;
  });
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
