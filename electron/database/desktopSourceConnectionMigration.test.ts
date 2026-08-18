// @vitest-environment node

import { createRequire } from 'node:module';

import { expect, it } from 'vitest';

import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

it('upgrades v66 without changing existing desktop source data or state', () => {
  const sqlite = new BetterSqlite3(':memory:');
  createV66SourceTables(sqlite);
  seedV66SourceData(sqlite);
  const before = readExistingSourceData(sqlite);

  initializeDatabaseSchema(sqlite);

  expect(readExistingSourceData(sqlite)).toEqual(before);
  expect(sqlite.prepare(`SELECT watched_binding_id, watched_relative_path
    FROM import_sources WHERE source_fingerprint = 'watched-fingerprint'`).get()).toEqual({
    watched_binding_id: null,
    watched_relative_path: null
  });
  expect(sqlite.prepare('SELECT COUNT(*) AS count FROM watched_folder_bindings').get()).toEqual({ count: 0 });
  expect(sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  sqlite.close();
});

it('upgrades a v66 database without optional import source tables', () => {
  const sqlite = new BetterSqlite3(':memory:');
  sqlite.pragma('user_version = 66');

  initializeDatabaseSchema(sqlite);

  expect(sqlite.prepare(`SELECT name FROM sqlite_master
    WHERE type = 'table' AND name = 'watched_folder_bindings'`).get()).toEqual({
    name: 'watched_folder_bindings'
  });
  expect(sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  sqlite.close();
});

function createV66SourceTables(sqlite: import('better-sqlite3').Database) {
  sqlite.exec(`CREATE TABLE external_search_folders (
    id TEXT PRIMARY KEY, folder_path TEXT NOT NULL, attachment_mode TEXT NOT NULL,
    attachment_root_path TEXT, excluded_dirs_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'idle', document_count INTEGER NOT NULL DEFAULT 0,
    indexed_at TEXT, last_error TEXT, owner_installation_id TEXT,
    owner_device_name TEXT, owner_platform TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE external_folder_device_preferences (
    installation_id TEXT NOT NULL, folder_id TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)), updated_at TEXT NOT NULL,
    PRIMARY KEY (installation_id, folder_id)
  );
  CREATE TABLE import_sources (
    source_fingerprint TEXT PRIMARY KEY, provider TEXT NOT NULL, source_kind TEXT NOT NULL,
    source_name TEXT NOT NULL, source_locator TEXT NOT NULL, first_imported_at TEXT NOT NULL,
    last_imported_at TEXT NOT NULL, last_content_fingerprint TEXT NOT NULL, latest_node_id TEXT
  );
  CREATE TABLE keep_import_items (
    rule_id TEXT NOT NULL, source_path TEXT NOT NULL, last_status TEXT NOT NULL,
    last_seen_at TEXT NOT NULL, last_node_id TEXT, PRIMARY KEY (rule_id, source_path)
  );
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
  PRAGMA user_version = 66;`);
}

function seedV66SourceData(sqlite: import('better-sqlite3').Database) {
  sqlite.exec(`INSERT INTO external_search_folders VALUES (
    'external-1', '/Library/External', 'document_relative', '/Library', '[".git"]',
    'ready', 7, '2026-08-01T00:00:00.000Z', NULL, 'installation-a',
    'Mac A', 'darwin', '2026-07-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'
  );
  INSERT INTO external_folder_device_preferences VALUES (
    'installation-a', 'external-1', 0, '2026-08-02T00:00:00.000Z'
  );
  INSERT INTO import_sources VALUES (
    'watched-fingerprint', 'markdown', 'file', 'Draft', '/Library/Drafts/draft.md',
    '2026-07-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 'content-hash', 'node-1'
  );
  INSERT INTO keep_import_items VALUES (
    'draft-import-source-1', '/Library/Drafts/draft.md', 'imported',
    '2026-08-01T00:00:00.000Z', 'node-1'
  );
  INSERT INTO settings VALUES (
    'import_manager_settings', '{"sources":[{"id":"draft-import-source-1","primaryPath":"/Library/Drafts"}],"readwiseRootPath":"/Library/Readwise"}',
    '2026-08-01T00:00:00.000Z'
  );`);
}

function readExistingSourceData(sqlite: import('better-sqlite3').Database) {
  return {
    external: sqlite.prepare('SELECT * FROM external_search_folders').all(),
    importManager: sqlite.prepare("SELECT * FROM settings WHERE key = 'import_manager_settings'").all(),
    importSources: sqlite.prepare(`SELECT source_fingerprint, provider, source_kind, source_name,
      source_locator, first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id
      FROM import_sources`).all(),
    keepItems: sqlite.prepare('SELECT * FROM keep_import_items').all(),
    preferences: sqlite.prepare('SELECT * FROM external_folder_device_preferences').all()
  };
}
