import { openDatabaseConnection } from './connection.js';

export function insertImportSourceSyncState() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO import_sources (
       source_fingerprint, provider, source_kind, source_name, source_locator,
       first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id,
       watched_binding_id, watched_relative_path
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['source-1', 'manual', 'markdown', 'notes.md', '/library/notes.md',
      '2026-04-27T00:04:00.000Z', '2026-04-27T00:04:00.000Z', 'content-1', 'node-1',
      'watched-source-1', 'notes.md']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('import_source', 'source-1', 5, 'import-source-hash',
       'desktop', '2026-04-27T00:04:00.000Z', 1)`
  );
}
