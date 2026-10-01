import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

import type { DatabaseMigrationTarget } from '../../lib/core/database/migrationTypes.js';
import { applyNumberedSchemaMigrations } from '../../lib/core/database/numberedMigrations.js';

export function installHistoricalDesktopSchema(sqlite: DatabaseMigrationTarget, targetVersion: number) {
  const baseline = targetVersion < 78 ? 66 : 78;
  const source = new Database(fileURLToPath(new URL(
    `./fixtures/public-desktop-main/schema-${baseline}/foliole.db`, import.meta.url
  )), { readonly: true, fileMustExist: true });
  try {
    const currentVersion = source.pragma('user_version', { simple: true }) as number;
    const statements = source.prepare(`SELECT sql FROM sqlite_master
      WHERE type IN ('table', 'index', 'view', 'trigger')
        AND name NOT GLOB 'sqlite_*' AND sql IS NOT NULL
      ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1
        WHEN 'view' THEN 2 WHEN 'trigger' THEN 3 END, rowid`).all() as { sql: string }[];
    sqlite.transaction(() => {
      for (const { sql } of statements) sqlite.exec(sql);
      sqlite.pragma(`user_version = ${currentVersion}`);
      applyNumberedSchemaMigrations({
        currentVersion,
        legacyMessage: 'historical desktop fixture is older than the supported baseline',
        setUserVersion: (version) => sqlite.pragma(`user_version = ${version}`),
        sqlite,
        targetVersion
      });
    })();
  } finally {
    source.close();
  }
}

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
