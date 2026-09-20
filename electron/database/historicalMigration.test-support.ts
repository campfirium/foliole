import type { DatabaseMigrationTarget } from '../../lib/core/database/migrationTypes.js';

// Pre-Host schema: b54d1a6b8^:lib/core/database/syncSchemaStatements.ts.
// Keep legacy column names so the numbered migrations exercise their renames.
export function createHistoricalSettingsAndSyncTables(sqlite: DatabaseMigrationTarget) {
  sqlite.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE setting_records (
      key TEXT NOT NULL,
      scope TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT '*',
      form_factor TEXT NOT NULL DEFAULT '*',
      device_id TEXT NOT NULL DEFAULT '*',
      value_json TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      PRIMARY KEY (key, scope, platform, form_factor, device_id)
    );
    CREATE TABLE sync_peer_cursors (
      peer_id TEXT NOT NULL,
      stream_name TEXT NOT NULL,
      cursor_value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (peer_id, stream_name)
    );
    CREATE TABLE sync_object_state (
      object_type TEXT NOT NULL,
      object_id TEXT NOT NULL,
      state_seq INTEGER NOT NULL UNIQUE,
      current_version_id TEXT,
      content_hash TEXT NOT NULL,
      last_modified_by_device_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_dirty INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (object_type, object_id)
    );
  `);
}

export function createHistoricalImportSourcesTable(sqlite: DatabaseMigrationTarget) {
  sqlite.exec(`CREATE TABLE import_sources (
    source_fingerprint TEXT PRIMARY KEY, provider TEXT NOT NULL, source_kind TEXT NOT NULL,
    source_name TEXT NOT NULL, source_locator TEXT NOT NULL, first_imported_at TEXT NOT NULL,
    last_imported_at TEXT NOT NULL, last_content_fingerprint TEXT NOT NULL, latest_node_id TEXT
  )`);
}
