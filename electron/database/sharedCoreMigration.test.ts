// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-shared-core-schema-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import {
  applyNumberedSchemaMigrations,
  DATABASE_SCHEMA_VERSION,
  initializeDatabaseConnection,
  resolveNumberedSchemaMigrations
} from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-shared-core-schema-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('initializes a fresh database with the current schema', () => {
  const connection = initializeDatabaseConnection(openDatabaseConnection());

  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);

  const tables = connection.sqlite
    .prepare(
       `SELECT name
       FROM sqlite_master
       WHERE type = 'table' AND name IN (
         'attachment_blobs', 'content_blob_data', 'content_blobs', 'external_documents', 'node_reading_device_state', 'node_sync_conflicts', 'node_sync_versions', 'node_view_state', 'nodes', 'node_reading', 'node_review', 'review_log', 'setting_records', 'settings', 'sync_change_log', 'sync_object_state', 'sync_peer_cursors', 'sync_peers', 'workspace_meta'
       )
       ORDER BY name ASC`
    )
    .all() as Array<{ name: string }>;

  expect(tables).toEqual([
    { name: 'attachment_blobs' },
    { name: 'content_blob_data' },
    { name: 'content_blobs' },
    { name: 'external_documents' },
    { name: 'node_reading' },
    { name: 'node_reading_device_state' },
    { name: 'node_review' },
    { name: 'node_sync_conflicts' },
    { name: 'node_sync_versions' },
    { name: 'node_view_state' },
    { name: 'nodes' },
    { name: 'review_log' },
    { name: 'setting_records' },
    { name: 'settings' },
    { name: 'sync_change_log' },
    { name: 'sync_object_state' },
    { name: 'sync_peer_cursors' },
    { name: 'sync_peers' },
    { name: 'workspace_meta' }
  ]);
});

it('applies content blob migrations to existing v28 databases', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    INSERT INTO nodes (id, title, content, updated_at)
    VALUES ('node-1', 'Node 1', 'Long body text', '2026-04-27T00:00:00.000Z');

    CREATE TABLE external_documents (
      document_id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO external_documents (document_id, content, updated_at)
    VALUES ('doc-1', 'External body text', '2026-04-27T00:00:00.000Z');
  `);
  connection.sqlite.pragma('user_version = 28');

  initializeDatabaseConnection(connection);

  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  const table = connection.sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'content_blobs'")
    .get() as { name: string } | undefined;
  expect(table).toEqual({ name: 'content_blobs' });
  const columns = connection.sqlite.prepare('PRAGMA table_info(content_blobs)').all() as Array<{ name: string }>;
  expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining([
    'hash',
    'storage_key',
    'kind',
    'compression',
    'original_size_bytes',
    'stored_size_bytes',
    'availability'
  ]));
  const nodeColumns = connection.sqlite.prepare('PRAGMA table_info(nodes)').all() as Array<{ name: string }>;
  const externalColumns = connection.sqlite.prepare('PRAGMA table_info(external_documents)').all() as Array<{ name: string }>;
  expect(nodeColumns.map((column) => column.name)).toContain('body_blob_hash');
  expect(externalColumns.map((column) => column.name)).toContain('body_blob_hash');

  const node = connection.sqlite
    .prepare('SELECT body_blob_hash FROM nodes WHERE id = ?')
    .get('node-1') as { body_blob_hash: string } | undefined;
  const externalDocument = connection.sqlite
    .prepare('SELECT body_blob_hash FROM external_documents WHERE document_id = ?')
    .get('doc-1') as { body_blob_hash: string } | undefined;
  expect(node?.body_blob_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(externalDocument?.body_blob_hash).toMatch(/^[a-f0-9]{64}$/);

  const blobCount = connection.sqlite
    .prepare("SELECT COUNT(*) AS count FROM content_blobs WHERE kind = 'text_body' AND availability = 'local'")
    .get() as { count: number };
  expect(blobCount.count).toBe(2);
  const blobDataCount = connection.sqlite
    .prepare('SELECT COUNT(*) AS count FROM content_blob_data')
    .get() as { count: number };
  expect(blobDataCount.count).toBe(2);
});

it('migrates node view state to device-scoped rows', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO settings (key, value, updated_at)
    VALUES ('desktop_device_id', '"desktop-test"', '2026-04-27T00:00:00.000Z');

    CREATE TABLE node_view_state (
      node_id TEXT PRIMARY KEY,
      scroll_top INTEGER NOT NULL DEFAULT 0,
      selection_from INTEGER,
      selection_to INTEGER,
      updated_at TEXT NOT NULL
    );
    INSERT INTO node_view_state (node_id, scroll_top, selection_from, selection_to, updated_at)
    VALUES ('node-1', 42, 4, 8, '2026-04-27T00:01:00.000Z');
  `);
  connection.sqlite.pragma('user_version = 30');

  initializeDatabaseConnection(connection);

  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  const columns = connection.sqlite.prepare('PRAGMA table_info(node_view_state)').all() as Array<{ name: string }>;
  expect(columns.map((column) => column.name)).toEqual([
    'node_id',
    'device_id',
    'scroll_top',
    'selection_from',
    'selection_to',
    'source',
    'updated_at'
  ]);
  expect(connection.sqlite
    .prepare('SELECT node_id, device_id, scroll_top FROM node_view_state')
    .get()).toEqual({ device_id: 'desktop-test', node_id: 'node-1', scroll_top: 42 });
});

it('adds source to device-scoped node view state rows', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`
    CREATE TABLE node_view_state (
      node_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      scroll_top INTEGER NOT NULL DEFAULT 0,
      selection_from INTEGER,
      selection_to INTEGER,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (node_id, device_id)
    );
    INSERT INTO node_view_state (node_id, device_id, scroll_top, selection_from, selection_to, updated_at)
    VALUES ('node-1', 'desktop-test', 42, NULL, NULL, '2026-04-30T00:00:00.000Z');
  `);
  connection.sqlite.pragma('user_version = 32');

  initializeDatabaseConnection(connection);

  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  expect(connection.sqlite
    .prepare('SELECT source FROM node_view_state WHERE node_id = ? AND device_id = ?')
    .get('node-1', 'desktop-test')).toEqual({ source: 'user-scroll' });
});

it('migrates reading position to device-scoped rows', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO settings (key, value, updated_at)
    VALUES ('desktop_device_id', '"desktop-test"', '2026-04-27T00:00:00.000Z');

    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    INSERT INTO nodes (id, title, content, updated_at)
    VALUES ('node-reading', 'Reading', 'body', '2026-04-27T00:00:00.000Z');

    CREATE TABLE node_reading (
      node_id TEXT PRIMARY KEY REFERENCES nodes(id),
      interval_duration_ms INTEGER NOT NULL DEFAULT 0,
      interval_growth_factor REAL NOT NULL DEFAULT 1,
      last_handled_at TEXT NOT NULL,
      next_at TEXT NOT NULL,
      priority REAL NOT NULL DEFAULT 0,
      reading_position INTEGER NOT NULL DEFAULT 0,
      repetition_count INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'active'
    );
    INSERT INTO node_reading (
      node_id, interval_duration_ms, interval_growth_factor, last_handled_at,
      next_at, priority, reading_position, repetition_count, state
    ) VALUES (
      'node-reading', 100, 1.5, '2026-04-27T01:00:00.000Z',
      '2026-04-28T01:00:00.000Z', 2, 77, 3, 'active'
    );
  `);
  connection.sqlite.pragma('user_version = 31');

  initializeDatabaseConnection(connection);

  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  expect(connection.sqlite
    .prepare('SELECT node_id, device_id, reading_position FROM node_reading_device_state')
    .get()).toEqual({ device_id: 'desktop-test', node_id: 'node-reading', reading_position: 77 });
  const readingColumns = connection.sqlite.prepare('PRAGMA table_info(node_reading)').all() as Array<{ name: string }>;
  expect(readingColumns.map((column) => column.name)).not.toContain('reading_position');
});

it('rejects legacy development databases and requires a fresh schema reset', () => {
  const connection = openDatabaseConnection();

  connection.sqlite.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT ''
    );
  `);
  connection.sqlite.pragma('user_version = 12');

  expect(() => initializeDatabaseConnection(connection)).toThrow(/reset foliole\.db and initialize fresh schema/i);
});

it('requires numbered migrations for every schema version after v28', () => {
  expect(resolveNumberedSchemaMigrations({
    currentVersion: 28,
    legacyMessage: 'legacy',
    migrations: [
      { version: 29, migrate: () => undefined },
      { version: 30, migrate: () => undefined }
    ],
    targetVersion: 30
  }).map((migration) => migration.version)).toEqual([29, 30]);

  expect(() => resolveNumberedSchemaMigrations({
    currentVersion: 28,
    legacyMessage: 'legacy',
    migrations: [{ version: 30, migrate: () => undefined }],
    targetVersion: 30
  })).toThrow(/missing database schema migration for version 29/i);
});

it('rejects duplicate numbered schema migrations', () => {
  expect(() => resolveNumberedSchemaMigrations({
    currentVersion: 28,
    legacyMessage: 'legacy',
    migrations: [
      { version: 29, migrate: () => undefined },
      { version: 29, migrate: () => undefined }
    ],
    targetVersion: 29
  })).toThrow(/duplicate database schema migration registered for version 29/i);
});

it('applies numbered schema migrations and advances user_version after each version', () => {
  const events: string[] = [];

  applyNumberedSchemaMigrations({
    currentVersion: 28,
    legacyMessage: 'legacy',
    migrations: [
      { version: 29, migrate: () => events.push('migrate-29') },
      { version: 30, migrate: () => events.push('migrate-30') }
    ],
    setUserVersion: (version) => events.push(`version-${version}`),
    sqlite: {} as never,
    targetVersion: 30
  });

  expect(events).toEqual(['migrate-29', 'version-29', 'migrate-30', 'version-30']);
});

it('creates new nodes columns required by sync-aware schema', () => {
  const connection = initializeDatabaseConnection(openDatabaseConnection());

  const columns = connection.sqlite.prepare(`PRAGMA table_info(nodes)`).all() as Array<{ name: string }>;
  expect(columns.map((column) => column.name)).toEqual(
    expect.arrayContaining([
      'virtual_filter',
      'body_blob_hash',
      'position',
      'current_version_id',
      'last_modified_by_device_id',
      'sync_dirty'
    ])
  );
});
