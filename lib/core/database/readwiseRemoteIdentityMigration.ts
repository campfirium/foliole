import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { addColumnIfMissing, tableExists } from './numberedMigrationHelpers.js';

export const READWISE_REMOTE_IDENTITY_INDEXES = [
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_import_sources_readwise_remote_document
    ON import_sources (remote_connection_ref, remote_document_id)
    WHERE remote_provider = 'readwise' AND remote_connection_ref IS NOT NULL AND remote_document_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_import_sources_readwise_remote_topic
    ON import_sources (remote_connection_ref, latest_node_id)
    WHERE remote_provider = 'readwise' AND remote_connection_ref IS NOT NULL AND latest_node_id IS NOT NULL`
] as const;

export function migrateReadwiseRemoteIdentity(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'import_sources')) return;
  addColumnIfMissing(sqlite, 'import_sources', 'remote_provider', 'TEXT');
  addColumnIfMissing(sqlite, 'import_sources', 'remote_connection_ref', 'TEXT');
  addColumnIfMissing(sqlite, 'import_sources', 'remote_document_id', 'TEXT');
  addColumnIfMissing(sqlite, 'import_sources', 'remote_annotations_json', "TEXT NOT NULL DEFAULT '[]'");
  for (const statement of READWISE_REMOTE_IDENTITY_INDEXES) sqlite.exec(statement);
}
