import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { columnExists, tableExists } from './numberedMigrationHelpers.js';

const AUTHOR_COLUMN_RENAMES = [
  ['nodes', 'last_modified_by_device_id', 'last_modified_by_host_name'],
  ['node_sync_versions', 'device_id', 'host_name'],
  ['node_sync_tombstones', 'device_id', 'host_name'],
  ['node_sync_conflicts', 'device_id', 'host_name'],
  ['node_text_alternatives', 'source_device_id', 'source_host_name'],
  ['review_log', 'device_id', 'host_name'],
  ['sync_object_state', 'last_modified_by_device_id', 'last_modified_by_host_name'],
  ['sync_change_log', 'device_id', 'host_name'],
  ['attachment_blobs', 'source_device_id', 'source_host_name'],
  ['content_blobs', 'source_device_id', 'source_host_name']
] as const;

export function migrateAuthorHostSnapshots(sqlite: DatabaseMigrationTarget) {
  for (const [table, previous, current] of AUTHOR_COLUMN_RENAMES) {
    if (tableExists(sqlite, table) && columnExists(sqlite, table, previous)) {
      sqlite.exec(`ALTER TABLE ${table} RENAME COLUMN ${previous} TO ${current}`);
    }
  }
  sqlite.exec('DROP INDEX IF EXISTS idx_review_log_device_id');
  sqlite.exec('DROP INDEX IF EXISTS idx_sync_change_log_device_created');
  sqlite.exec('DROP INDEX IF EXISTS idx_node_text_alternatives_available_source');
  if (tableExists(sqlite, 'review_log')) {
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_review_log_host_name ON review_log (host_name)');
  }
  if (tableExists(sqlite, 'sync_change_log')) {
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_sync_change_log_host_created
      ON sync_change_log (host_name, created_at)`);
  }
  if (tableExists(sqlite, 'node_text_alternatives')) {
    sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_node_text_alternatives_available_source
      ON node_text_alternatives (node_id, source_host_name) WHERE status = 'available'`);
  }
}
