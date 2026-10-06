import type { DbPort } from '../sync/dbPort.js';

import { framedSyncNodeInventorySql } from './framedSyncInventoryProjectionSql.js';
import { FRAMED_SYNC_INVENTORY_TRIGGERS } from './framedSyncInventorySchema.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';

function migrationStatements() {
  const triggers = FRAMED_SYNC_INVENTORY_TRIGGERS;
  const drops = triggers.map((sql) => {
    const name = /^CREATE TRIGGER IF NOT EXISTS (\w+)/u.exec(sql)?.[1];
    if (!name) throw new Error('framed_sync_inventory_trigger_name_invalid');
    return `DROP TRIGGER IF EXISTS ${name}`;
  });
  const inventory = framedSyncNodeInventorySql(`SELECT state.object_id FROM sync_object_state state
    JOIN node_sync_tombstones tomb ON tomb.node_id = state.object_id
      AND tomb.content_hash = state.content_hash AND tomb.deleted_at = state.deleted_at
    WHERE state.object_type = 'node' AND state.current_version_id IS NULL`)
    .split(';').filter((sql) => sql.trim());
  return [...drops, ...triggers, ...inventory];
}

export function migrateFramedSyncTombstoneInventory(sqlite: DatabaseMigrationTarget) {
  for (const sql of migrationStatements()) sqlite.exec(sql);
}

export async function migrateCompanionFramedSyncTombstoneInventory(port: DbPort) {
  for (const sql of migrationStatements()) await port.run(sql);
}
