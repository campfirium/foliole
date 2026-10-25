import { RETIRED_RESOURCE_AVAILABILITY_TRIGGERS } from '../../lib/core/database/framedSyncInventorySchema.js';
import { FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL } from '../../lib/core/database/framedSyncResourceAvailability.js';
import type { DatabaseMigrationTarget } from '../../lib/core/database/migrationTypes.js';
import { attachmentTrashDirectory, inventoryAttachmentDirectory } from '../attachments/attachmentTrashFiles.js';

/** Seed file presence without changing node facts or their cached comparison digests. */
export function recordResourceAvailabilityInBulk(sqlite: DatabaseMigrationTarget, hashes: Iterable<string>) {
  for (const name of RETIRED_RESOURCE_AVAILABILITY_TRIGGERS) sqlite.exec(`DROP TRIGGER IF EXISTS ${name}`);
  const record = sqlite.prepare(FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL);
  for (const hash of hashes) record.run(hash, 1);
}

/** Libraries older than v141 have no presence facts for attachment files already on disk. */
export function seedLegacyResourceAvailability(sqlite: DatabaseMigrationTarget, assetsDir: string) {
  const files = [...inventoryAttachmentDirectory(assetsDir), ...inventoryAttachmentDirectory(attachmentTrashDirectory(assetsDir))];
  recordResourceAvailabilityInBulk(sqlite, new Set(files.map((file) => file.storageKey.slice(0, 64))));
}
