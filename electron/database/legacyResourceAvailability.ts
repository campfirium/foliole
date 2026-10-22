import { framedSyncNodeInventorySql, framedSyncResourceVersionSql } from '../../lib/core/database/framedSyncInventoryProjectionSql.js';
import { FRAMED_SYNC_INVENTORY_TRIGGERS } from '../../lib/core/database/framedSyncInventorySchema.js';
import { FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL } from '../../lib/core/database/framedSyncResourceAvailability.js';
import type { DatabaseMigrationTarget } from '../../lib/core/database/migrationTypes.js';
import { attachmentTrashDirectory, inventoryAttachmentDirectory } from '../attachments/attachmentTrashFiles.js';

const AVAILABILITY_TRIGGERS = FRAMED_SYNC_INVENTORY_TRIGGERS.flatMap((sql) => {
  const name = /^CREATE TRIGGER IF NOT EXISTS (trg_framed_inventory_framed_sync_resource_availability_\w+)/u.exec(sql)?.[1];
  return name ? [{ name, sql }] : [];
});

const AFFECTED_NODES_SQL = `SELECT state.object_id FROM sync_object_state state
  JOIN framed_sync_version_summary version ON version.version_id = ${framedSyncResourceVersionSql('state')},
  json_each(version.resource_hashes_json) resource
  WHERE state.object_type = 'node' AND resource.value IN (SELECT hash FROM temp_legacy_resource_availability)`;

/**
 * Same final inventory as one availability write per hash, but refreshes each affected Node once.
 * The caller owns the upgrade transaction, so a failure also restores the dropped triggers.
 */
export function recordResourceAvailabilityInBulk(sqlite: DatabaseMigrationTarget, hashes: Iterable<string>) {
  for (const trigger of AVAILABILITY_TRIGGERS) sqlite.exec(`DROP TRIGGER IF EXISTS ${trigger.name}`);
  sqlite.exec('CREATE TEMP TABLE temp_legacy_resource_availability (hash TEXT PRIMARY KEY)');
  const remember = sqlite.prepare('INSERT OR IGNORE INTO temp_legacy_resource_availability (hash) VALUES (?)');
  const record = sqlite.prepare(FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL);
  for (const hash of hashes) {
    remember.run(hash);
    record.run(hash, 1);
  }
  sqlite.exec(framedSyncNodeInventorySql(AFFECTED_NODES_SQL));
  sqlite.exec('DROP TABLE temp_legacy_resource_availability');
  for (const trigger of AVAILABILITY_TRIGGERS) sqlite.exec(trigger.sql);
}

/** Libraries older than v141 have no presence facts for attachment files already on disk. */
export function seedLegacyResourceAvailability(sqlite: DatabaseMigrationTarget, assetsDir: string) {
  const files = [...inventoryAttachmentDirectory(assetsDir), ...inventoryAttachmentDirectory(attachmentTrashDirectory(assetsDir))];
  recordResourceAvailabilityInBulk(sqlite, new Set(files.map((file) => file.storageKey.slice(0, 64))));
}
