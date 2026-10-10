import type { DbPort } from '../sync/dbPort.js';

import { framedSyncNodeInventorySql } from './framedSyncInventoryProjectionSql.js';
import { FRAMED_SYNC_INVENTORY_TRIGGERS } from './framedSyncInventorySchema.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';

function statements() {
  const drop = FRAMED_SYNC_INVENTORY_TRIGGERS.map(sql => {
    const name = /^CREATE TRIGGER IF NOT EXISTS (trg_framed_inventory_[a-z_]+)/u.exec(sql)?.[1];
    if (!name) throw new Error('framed_sync_inventory_trigger_invalid');
    return `DROP TRIGGER IF EXISTS ${name}`;
  });
  return [...drop, ...FRAMED_SYNC_INVENTORY_TRIGGERS,
    ...framedSyncNodeInventorySql("SELECT object_id FROM sync_object_state WHERE object_type = 'node'")
      .split(';').filter(sql => sql.trim())];
}

/** Legacy NULL is missing. Only an explicit deletion is propagated as deletion. */
export function migrateNodeHistoryState(sqlite: DatabaseMigrationTarget) {
  for (const sql of statements()) sqlite.exec(sql);
}

export async function migrateCompanionNodeHistoryState(db: DbPort) {
  for (const sql of statements()) await db.run(sql);
}
