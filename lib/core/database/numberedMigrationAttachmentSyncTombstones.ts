import { ATTACHMENT_SYNC_TOMBSTONE_SCHEMA_STATEMENTS } from './attachmentSyncTombstoneSchemaStatements.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';

export function createAttachmentSyncTombstoneTable(sqlite: DatabaseMigrationTarget) {
  for (const statement of ATTACHMENT_SYNC_TOMBSTONE_SCHEMA_STATEMENTS) sqlite.exec(statement);
}
