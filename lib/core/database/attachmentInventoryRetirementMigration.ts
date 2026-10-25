import type { DbPort } from '../sync/dbPort.js';

import { framedSyncNodeInventorySql } from './framedSyncInventoryProjectionSql.js';
import { dropFramedSyncInventoryTriggers, FRAMED_SYNC_INVENTORY_TRIGGERS } from './framedSyncInventorySchema.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';

// Attachment presence belongs to the pending-file queue, not the node fact inventory.
function statements() {
  const rebuild = framedSyncNodeInventorySql(
    "SELECT object_id FROM sync_object_state WHERE object_type = 'node'").split(';').filter(sql => sql.trim());
  return [...dropFramedSyncInventoryTriggers(), ...rebuild, ...FRAMED_SYNC_INVENTORY_TRIGGERS];
}

export function retireAttachmentInventory(db: DatabaseMigrationTarget) {
  for (const sql of statements()) db.exec(sql);
}

export async function retireCompanionAttachmentInventory(db: DbPort) {
  for (const sql of statements()) await db.run(sql);
}
