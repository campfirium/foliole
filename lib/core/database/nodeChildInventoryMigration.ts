import type { DbPort } from '../sync/dbPort.js';

import { framedSyncNodeInventorySql } from './framedSyncInventoryProjectionSql.js';
import { FRAMED_SYNC_INVENTORY_TRIGGERS } from './framedSyncInventorySchema.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { NODE_CHILD_OWNER_SCHEMA } from './nodeChildStateSql.js';

function statements() {
  const drops = FRAMED_SYNC_INVENTORY_TRIGGERS.map(sql => {
    const name = /^CREATE TRIGGER IF NOT EXISTS (\w+)/u.exec(sql)?.[1];
    if (!name) throw new Error('framed_sync_inventory_trigger_name_invalid');
    return `DROP TRIGGER IF EXISTS ${name}`;
  });
  const rebuild = framedSyncNodeInventorySql(
    "SELECT object_id FROM sync_object_state WHERE object_type = 'node'").split(';').filter(sql => sql.trim());
  return [...drops, ...NODE_CHILD_OWNER_SCHEMA,
    `INSERT OR REPLACE INTO sync_node_child_owners (object_type, object_id, node_id)
      SELECT 'import_source', source_fingerprint, latest_node_id FROM import_sources WHERE latest_node_id IS NOT NULL`,
    `INSERT OR REPLACE INTO sync_node_child_owners (object_type, object_id, node_id)
      SELECT 'node_text_alternative', alternative_id, node_id FROM node_text_alternatives`,
    ...rebuild, ...FRAMED_SYNC_INVENTORY_TRIGGERS];
}

export function migrateNodeChildInventory(sqlite: DatabaseMigrationTarget) {
  for (const sql of statements()) sqlite.exec(sql);
}

export async function migrateCompanionNodeChildInventory(db: DbPort) {
  for (const sql of statements()) await db.run(sql);
}
