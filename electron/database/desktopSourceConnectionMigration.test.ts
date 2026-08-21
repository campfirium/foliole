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
  expect(sqlite.prepare(`SELECT source_type, config_ref, host_name, root_path FROM desktop_sources
    ORDER BY source_type, config_ref`).all()).toEqual([
    { config_ref: 'external-1', host_name: 'Windows PC', root_path: '/Library/External', source_type: 'external' },
    { config_ref: 'readwise-articles', host_name: 'Mac A', root_path: '/Library/Readwise/Articles', source_type: 'readwise' },
    { config_ref: 'draft-import-source-1', host_name: 'Mac A', root_path: '/Library/Drafts', source_type: 'watched' }
  ]);
  expect(sqlite.prepare(`SELECT type_settings_json FROM desktop_sources
    WHERE source_type = 'readwise' AND config_ref = 'readwise-articles'`).get()).toEqual({
    type_settings_json: JSON.stringify({
      archivePath: '', highlightPath: '', keepState: 'enabled', kind: 'articles'
    })
  });
  expect(sqlite.prepare(`SELECT host_name, folder_id, enabled FROM external_folder_host_preferences`).get())
    .toEqual({ enabled: 0, folder_id: 'external-1', host_name: 'Mac A' });
  expect(sqlite.prepare("SELECT value FROM settings WHERE key = 'readwise_active_host'").get())
    .toEqual({ value: '{"host_name":"Office PC"}' });
  expect(sqlite.prepare("SELECT value FROM settings WHERE key = 'readwise_active_device'").get()).toBeUndefined();
  expect(sqlite.prepare("SELECT name FROM pragma_table_info('external_search_folders')").pluck().all())
    .not.toContain('owner_installation_id');
  expect(sqlite.prepare(`SELECT source_locator, source_ref, source_location FROM import_sources
    WHERE source_fingerprint = 'watched-fingerprint'`).get()).toEqual({
    source_location: 'draft.md',
    source_locator: '/Library/Drafts/draft.md',
    source_ref: 'watched:draft-import-source-1'
  });
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

it('rejects legacy external preferences when the local Host cannot be recovered', () => {
  const sqlite = new BetterSqlite3(':memory:');
  createV66SourceTables(sqlite);
  seedV66SourceData(sqlite);
  sqlite.prepare("DELETE FROM settings WHERE key = 'device_id'").run();

  expect(() => initializeDatabaseSchema(sqlite)).toThrow('external_source_host_preference_host_missing');
  expect(sqlite.pragma('user_version', { simple: true })).toBe(66);
  sqlite.close();
});

it('repairs a deployed v67 import source schema before migrating desktop sources', () => {
  const sqlite = new BetterSqlite3(':memory:');
  createV66SourceTables(sqlite);
  sqlite.exec(`CREATE TABLE watched_folder_bindings (
    binding_id TEXT PRIMARY KEY, connected_device_id TEXT, connected_device_name TEXT,
    connected_platform TEXT, connection_status TEXT NOT NULL DEFAULT 'needs-folder',
    action_mode TEXT NOT NULL, archive_path TEXT NOT NULL DEFAULT '',
    highlight_mode TEXT NOT NULL, highlight_path TEXT NOT NULL DEFAULT '',
    primary_path TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL, deleted_at TEXT
  );
  PRAGMA user_version = 67;`);
  seedV66SourceData(sqlite);

  initializeDatabaseSchema(sqlite);

  expect(sqlite.prepare("SELECT name FROM pragma_table_info('import_sources')").pluck().all())
    .toEqual(expect.arrayContaining([
      'watched_binding_id', 'watched_relative_path', 'source_ref', 'source_location'
    ]));
  expect(sqlite.prepare(`SELECT name FROM sqlite_master
    WHERE type = 'index' AND name = 'idx_import_sources_watched_relative'`).get()).toEqual({
    name: 'idx_import_sources_watched_relative'
  });
  expect(sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  sqlite.close();
});

it('repairs a deployed v67 unassigned watched source without enabling it', () => {
  const sqlite = new BetterSqlite3(':memory:');
  createV66SourceTables(sqlite);
  sqlite.exec(`CREATE TABLE watched_folder_bindings (
    binding_id TEXT PRIMARY KEY, owner_installation_id TEXT, owner_device_name TEXT,
    owner_platform TEXT, claim_state TEXT NOT NULL, claim_revision TEXT,
    action_mode TEXT NOT NULL, archive_path TEXT NOT NULL, highlight_mode TEXT NOT NULL,
    highlight_path TEXT NOT NULL, keep_preview_json TEXT, primary_path TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0, availability TEXT NOT NULL DEFAULT 'unknown',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  );
  INSERT INTO watched_folder_bindings VALUES (
    'draft-102', NULL, NULL, NULL, 'unassigned', NULL, 'delete', '', 'split',
    'D:\\Highlights', '{"discoveredCount":3}', 'D:\\Articles', 0, 'unknown',
    '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z', NULL
  );
  INSERT INTO settings VALUES ('device_id', '"Windows PC"', '2026-08-17T00:00:00.000Z');
  PRAGMA user_version = 67;`);

  initializeDatabaseSchema(sqlite);

  expect(sqlite.prepare(`SELECT source_ref, host_name, host_platform, root_path
    FROM desktop_sources WHERE config_ref = 'draft-102'`).get()).toEqual({
    host_name: 'Windows PC', host_platform: process.platform, root_path: 'D:\\Articles',
    source_ref: 'watched:draft-102'
  });
  expect(sqlite.prepare(`SELECT connection_status, action_mode, highlight_path, primary_path, source_ref
    FROM watched_folder_bindings WHERE binding_id = 'draft-102'`).get()).toEqual({
    action_mode: 'delete', connection_status: 'needs-folder', highlight_path: 'D:\\Highlights',
    primary_path: 'D:\\Articles', source_ref: 'watched:draft-102'
  });
  expect(sqlite.prepare("SELECT name FROM pragma_table_info('watched_folder_bindings')").pluck().all())
    .not.toContain('claim_state');
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
    'ready', 7, '2026-08-01T00:00:00.000Z', NULL, 'installation-windows',
    'Windows PC', 'win32', '2026-07-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'
  );
  INSERT INTO external_folder_device_preferences VALUES (
    'installation-mac', 'external-1', 0, '2026-08-02T00:00:00.000Z'
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
    'import_manager_settings', '{"sources":[{"id":"draft-import-source-1","primaryPath":"/Library/Drafts","keepState":"enabled"}],"readwiseSources":[{"id":"readwise-articles","primaryPath":"/Library/Readwise/Articles","kind":"articles","keepState":"enabled"}],"readwiseRootPath":"/Library/Readwise"}',
    '2026-08-01T00:00:00.000Z'
  );
  INSERT INTO settings VALUES (
    'readwise_active_device', '{"device_id":"Office PC"}', '2026-08-02T00:00:00.000Z'
  );
  INSERT INTO settings VALUES ('device_id', '"Mac A"', '2026-08-02T00:00:00.000Z');`);
}

function readExistingSourceData(sqlite: import('better-sqlite3').Database) {
  const hasHostPreferences = sqlite.prepare(`SELECT 1 FROM sqlite_master
    WHERE type = 'table' AND name = 'external_folder_host_preferences'`).get();
  return {
    external: sqlite.prepare(`SELECT id, folder_path, attachment_mode, attachment_root_path,
      excluded_dirs_json, status, document_count, indexed_at, last_error,
      created_at, updated_at FROM external_search_folders`).all(),
    importManager: sqlite.prepare("SELECT * FROM settings WHERE key = 'import_manager_settings'").all(),
    importSources: sqlite.prepare(`SELECT source_fingerprint, provider, source_kind, source_name,
      source_locator, first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id
      FROM import_sources`).all(),
    keepItems: sqlite.prepare('SELECT * FROM keep_import_items').all(),
    preferences: hasHostPreferences
      ? sqlite.prepare('SELECT folder_id, enabled, updated_at FROM external_folder_host_preferences').all()
      : sqlite.prepare('SELECT folder_id, enabled, updated_at FROM external_folder_device_preferences').all()
  };
}
