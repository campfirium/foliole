// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-shared-core-migration-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { DATABASE_SCHEMA_VERSION, initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-shared-core-migration-'));
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
         'attachment_blobs', 'external_documents', 'node_sync_conflicts', 'node_sync_versions', 'nodes', 'node_reading', 'node_review', 'review_log', 'setting_records', 'settings', 'sync_change_log', 'sync_object_state', 'sync_peers', 'workspace_meta'
       )
       ORDER BY name ASC`
    )
    .all() as Array<{ name: string }>;

  expect(tables).toEqual([
    { name: 'attachment_blobs' },
    { name: 'external_documents' },
    { name: 'node_reading' },
    { name: 'node_review' },
    { name: 'node_sync_conflicts' },
    { name: 'node_sync_versions' },
    { name: 'nodes' },
    { name: 'review_log' },
    { name: 'setting_records' },
    { name: 'settings' },
    { name: 'sync_change_log' },
    { name: 'sync_object_state' },
    { name: 'sync_peers' },
    { name: 'workspace_meta' }
  ]);
});

it('rejects legacy development databases and requires rebuild', () => {
  const connection = openDatabaseConnection();

  connection.sqlite.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT ''
    );
  `);
  connection.sqlite.pragma('user_version = 12');

  expect(() => initializeDatabaseConnection(connection)).toThrow(/delete the existing foliole\.db and rebuild/i);
});

it('creates new nodes columns required by sync-aware schema', () => {
  const connection = initializeDatabaseConnection(openDatabaseConnection());

  const columns = connection.sqlite.prepare(`PRAGMA table_info(nodes)`).all() as Array<{ name: string }>;
  expect(columns.map((column) => column.name)).toEqual(
    expect.arrayContaining([
      'virtual_filter',
      'position',
      'current_version_id',
      'last_modified_by_device_id',
      'sync_dirty'
    ])
  );
});
