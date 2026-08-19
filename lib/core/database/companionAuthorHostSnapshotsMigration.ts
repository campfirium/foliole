import type { DbPort } from '../sync/dbPort.js';

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

export async function migrateCompanionAuthorHostSnapshots(db: DbPort) {
  for (const [table, previous, current] of AUTHOR_COLUMN_RENAMES) {
    if (await columnPresent(db, table, previous)) {
      await db.run(`ALTER TABLE ${table} RENAME COLUMN ${previous} TO ${current}`);
    }
  }
  await db.run('DROP INDEX IF EXISTS idx_review_log_device_id');
  await db.run('DROP INDEX IF EXISTS idx_sync_change_log_device_created');
  await db.run('DROP INDEX IF EXISTS idx_node_text_alternatives_available_source');
}

async function columnPresent(db: DbPort, table: string, column: string) {
  const tables = await db.query(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1", [table]
  );
  if (tables.length === 0) return false;
  return (await db.query('SELECT name FROM pragma_table_info(?) WHERE name = ?', [table, column])).length > 0;
}
