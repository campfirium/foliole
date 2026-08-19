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
  DATABASE_SCHEMA_VERSION,
  initializeDatabaseConnection
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
         'attachment_blobs', 'content_blob_data', 'content_blobs', 'external_documents', 'node_reading_host_state', 'node_sync_conflicts', 'node_sync_versions', 'node_view_state', 'nodes', 'node_reading', 'node_review', 'review_log', 'search_index_invalidations', 'setting_records', 'settings', 'source_disposition_states', 'sync_change_log', 'sync_object_state', 'sync_peer_cursors', 'sync_peers', 'workspace_meta'
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
    { name: 'node_reading_host_state' },
    { name: 'node_review' },
    { name: 'node_sync_conflicts' },
    { name: 'node_sync_versions' },
    { name: 'node_view_state' },
    { name: 'nodes' },
    { name: 'review_log' },
    { name: 'search_index_invalidations' },
    { name: 'setting_records' },
    { name: 'settings' },
    { name: 'source_disposition_states' },
    { name: 'sync_change_log' },
    { name: 'sync_object_state' },
    { name: 'sync_peer_cursors' },
    { name: 'sync_peers' },
    { name: 'workspace_meta' }
  ]);
});

it('migrates the legacy desktop device id setting to the shared device id key', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO settings (key, value, updated_at)
    VALUES ('desktop_device_id', '"desktop-test"', '2026-04-27T00:00:00.000Z');
  `);
  connection.sqlite.pragma('user_version = 33');

  initializeDatabaseConnection(connection);

  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  expect(connection.sqlite
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get('device_id')).toEqual({ value: '"desktop-test"' });
});

it('adds primary device commit columns to existing sync peers', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`
    CREATE TABLE sync_peers (
      peer_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'paired',
      last_synced_at TEXT,
      last_seen_version_cursor TEXT,
      updated_at TEXT NOT NULL
    );
  `);
  connection.sqlite.pragma('user_version = 34');

  initializeDatabaseConnection(connection);

  const columns = connection.sqlite.prepare('PRAGMA table_info(sync_peers)').all() as Array<{ name: string }>;
  expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining([
    'primary_committed_at',
    'primary_device_epoch',
    'primary_updated_by_device_id'
  ]));
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
});

it('adds search index invalidation queue to existing v39 databases', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.pragma('user_version = 39');

  initializeDatabaseConnection(connection);

  expect(connection.sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'search_index_invalidations'")
    .get()).toEqual({ name: 'search_index_invalidations' });
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
});

it('migrates reading position through the frozen device step into Host scope', () => {
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
    .prepare('SELECT node_id, host_name, reading_position FROM node_reading_host_state')
    .get()).toEqual({ host_name: 'desktop-test', node_id: 'node-reading', reading_position: 77 });
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

it('creates new nodes columns required by sync-aware schema', () => {
  const connection = initializeDatabaseConnection(openDatabaseConnection());

  const columns = connection.sqlite.prepare(`PRAGMA table_info(nodes)`).all() as Array<{ name: string }>;
  expect(columns.map((column) => column.name)).toEqual(
    expect.arrayContaining([
      'virtual_filter',
      'body_blob_hash',
      'position',
      'current_version_id',
      'last_modified_by_host_name',
      'sync_dirty'
    ])
  );
});

it('adds incoming updates table to existing v48 desktop databases', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.pragma('user_version = 48');

  initializeDatabaseConnection(connection);

  expect(connection.sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'incoming_updates'")
    .get()).toEqual({ name: 'incoming_updates' });
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
});

it('retires assistant thread tables after upgrading existing v50 desktop databases', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.pragma('user_version = 50');

  initializeDatabaseConnection(connection);

  expect(connection.sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'assistant_thread_%'")
    .all()).toEqual([]);
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
});

it('retires assistant thread tables after upgrading existing v52 desktop databases', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.pragma('user_version = 52');

  initializeDatabaseConnection(connection);

  expect(connection.sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'assistant_thread_%'")
    .all()).toEqual([]);
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
});
