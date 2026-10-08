import type { DbPort } from '../sync/dbPort.js';

import { migrateCompanionExternalDocumentBodyOwnership, migrateExternalDocumentBodyOwnership } from './externalDocumentBodyOwnershipMigration.js';
import { migrateCompanionFramedSyncFrozenBodies, migrateFramedSyncFrozenBodies } from './framedSyncFrozenBodyMigration.js';
import { framedSyncNodeInventorySql } from './framedSyncInventoryProjectionSql.js';
import { FRAMED_SYNC_INVENTORY_TRIGGERS } from './framedSyncInventorySchema.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { migrateCompanionNodeBodyOwnership, migrateNodeBodyOwnership } from './nodeBodyOwnershipMigration.js';
import { migrateCompanionOversizeVersionBodies, migrateOversizeVersionBodies } from './oversizeVersionBodyMigration.js';
import { migrateCompanionReadwiseSourceUpdateBodyOwnership, migrateReadwiseSourceUpdateBodyOwnership } from './readwiseSourceUpdateBodyOwnershipMigration.js';
import { migrateCompanionTopicTextBodyOwnership, migrateTopicTextBodyOwnership } from './topicTextBodyOwnershipMigration.js';

function inventoryStatements() {
  const drop = FRAMED_SYNC_INVENTORY_TRIGGERS.map((sql) => {
    const name = /^CREATE TRIGGER IF NOT EXISTS (trg_framed_inventory_[a-z_]+)/u.exec(sql)?.[1];
    if (!name) throw new Error('framed_sync_inventory_trigger_invalid');
    return `DROP TRIGGER IF EXISTS ${name}`;
  });
  const refresh = framedSyncNodeInventorySql(
    "SELECT object_id FROM sync_object_state WHERE object_type = 'node'").split(';').filter((sql) => sql.trim());
  return [...drop, ...FRAMED_SYNC_INVENTORY_TRIGGERS, ...refresh];
}

/** Existing schema executor owns the transaction and commits its version after all owners convert. */
export function migrateTextBodyOwnership(sqlite: DatabaseMigrationTarget) {
  migrateOversizeVersionBodies(sqlite);
  migrateTopicTextBodyOwnership(sqlite);
  migrateFramedSyncFrozenBodies(sqlite);
  migrateNodeBodyOwnership(sqlite);
  migrateExternalDocumentBodyOwnership(sqlite);
  migrateReadwiseSourceUpdateBodyOwnership(sqlite);
  for (const sql of inventoryStatements()) sqlite.exec(sql);
}

export async function migrateCompanionTextBodyOwnership(db: DbPort) {
  await migrateCompanionOversizeVersionBodies(db);
  await migrateCompanionTopicTextBodyOwnership(db);
  await migrateCompanionFramedSyncFrozenBodies(db);
  await migrateCompanionNodeBodyOwnership(db);
  await migrateCompanionExternalDocumentBodyOwnership(db);
  await migrateCompanionReadwiseSourceUpdateBodyOwnership(db);
  for (const sql of inventoryStatements()) await db.run(sql);
}
