// @vitest-environment node

import { createRequire } from 'node:module';

import { expect, it } from 'vitest';

import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

function createExperimentalV68Database() {
  const sqlite = new BetterSqlite3(':memory:');
  initializeDatabaseSchema(sqlite);
  sqlite.exec(`
    INSERT INTO settings (key, value, updated_at) VALUES
      ('device_id', '"desktop-local"', '2026-08-17T00:00:00.000Z'),
      ('import_manager_settings', '{"readwiseRootPath":"/legacy/readwise","readwiseReaderConfig":{"enabled":true}}',
       '2026-08-17T00:00:00.000Z');
    ALTER TABLE watched_folder_bindings ADD COLUMN claim_state TEXT NOT NULL DEFAULT 'unassigned';
    ALTER TABLE watched_folder_bindings ADD COLUMN claim_revision TEXT;
    INSERT INTO watched_folder_bindings (
      binding_id, owner_installation_id, owner_device_name, owner_platform, action_mode, archive_path,
      highlight_mode, highlight_path, primary_path, enabled, availability, created_at, updated_at,
      claim_state, claim_revision
    ) VALUES
      ('legacy', NULL, NULL, NULL, 'keep', '', 'merged', '', '/legacy/watch', 1, 'unknown', 'now', 'now', 'unassigned', NULL),
      ('owned', 'install-a', 'Mac A', 'darwin', 'keep', '', 'merged', '', '/mac/watch', 1, 'available', 'now', 'now', 'claimed', 'r1');
    CREATE TABLE readwise_import_policy (payload_json TEXT);
    INSERT INTO readwise_import_policy VALUES ('{"readwiseRootPath":"/experimental/readwise","readwiseReaderConfig":{"enabled":true}}');
    CREATE TABLE readwise_execution_authority (installation_id TEXT);
    CREATE TABLE readwise_legacy_binding_stage (payload_json TEXT);
    CREATE TABLE readwise_device_bindings (
      binding_id TEXT, source_kind TEXT, primary_path TEXT, highlight_path TEXT
    );
    INSERT INTO readwise_device_bindings VALUES
      ('article-binding', 'articles', '/experimental/full/articles', '/experimental/highlights/articles'),
      ('book-binding', 'books', '/experimental/full/books', '/experimental/highlights/books');
    INSERT INTO sync_object_state (
      object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
    ) VALUES ('readwise_policy', 'policy', 99, 'old-hash', 'desktop-local', '2026-08-17T00:00:00.000Z', 1);
    PRAGMA user_version = 68;
  `);
  return sqlite;
}

it('converges experimental v68 data into local Readwise settings and direct watched owners', () => {
  const sqlite = createExperimentalV68Database();

  initializeDatabaseSchema(sqlite);

  expect(sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  expect((sqlite.prepare('PRAGMA table_info(watched_folder_bindings)').all() as Array<{ name: string }>)
    .map((column) => column.name)).not.toContain('claim_state');
  expect(sqlite.prepare(
    'SELECT binding_id, enabled, owner_installation_id FROM watched_folder_bindings ORDER BY binding_id'
  ).all()).toEqual([
    { binding_id: 'legacy', enabled: 0, owner_installation_id: null },
    { binding_id: 'owned', enabled: 1, owner_installation_id: 'install-a' }
  ]);
  const deviceSetting = JSON.parse((sqlite.prepare(
    "SELECT value FROM settings WHERE key = 'readwise_device_settings'"
  ).get() as { value: string }).value) as Record<string, unknown>;
  expect(deviceSetting).toMatchObject({ confirmedAt: null, readwiseRootPath: '/experimental/readwise' });
  expect(deviceSetting.readwiseReaderConfig).toMatchObject({ enabled: false });
  expect(deviceSetting.readwiseSources).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'articles', primaryPath: '/experimental/full/articles' }),
    expect.objectContaining({ kind: 'books', primaryPath: '/experimental/full/books' })
  ]));
  expect((sqlite.prepare(
    "SELECT value FROM settings WHERE key = 'import_manager_settings'"
  ).get() as { value: string }).value).not.toContain('readwiseRootPath');
  expect(sqlite.prepare(
    "SELECT deleted_at, sync_dirty FROM sync_object_state WHERE object_type = 'readwise_policy'"
  ).get()).toMatchObject({ deleted_at: expect.any(String), sync_dirty: 1 });
  expect(sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'readwise_%'"
  ).all()).toEqual([]);
  sqlite.close();
});

it('upgrades committed v67 settings through the v69 simplification', () => {
  const sqlite = new BetterSqlite3(':memory:');
  initializeDatabaseSchema(sqlite);
  sqlite.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(
    'import_manager_settings',
    JSON.stringify({
      readwiseReaderConfig: { enabled: true },
      readwiseRootPath: '/v67/readwise'
    }),
    '2026-08-17T00:00:00.000Z'
  );
  sqlite.pragma('user_version = 67');

  initializeDatabaseSchema(sqlite);

  expect(sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  const recovered = JSON.parse((sqlite.prepare(
    "SELECT value FROM settings WHERE key = 'readwise_device_settings'"
  ).get() as { value: string }).value) as Record<string, unknown>;
  expect(recovered).toMatchObject({ confirmedAt: null, readwiseRootPath: '/v67/readwise' });
  expect(recovered.readwiseReaderConfig).toMatchObject({ enabled: false });
  expect((sqlite.prepare(
    "SELECT value FROM settings WHERE key = 'import_manager_settings'"
  ).get() as { value: string }).value).not.toContain('readwiseRootPath');
  sqlite.close();
});
