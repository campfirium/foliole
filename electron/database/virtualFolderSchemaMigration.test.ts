// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-virtual-folder-schema-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { DATABASE_SCHEMA_VERSION, initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { SYNC_OBJECT_POLICIES } from '../../lib/core/sync/syncObjectPolicy.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-virtual-folder-schema-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('keeps legacy virtual folder tables out of fresh databases', () => {
  const connection = openDatabaseConnection();
  initializeDatabaseConnection(connection);

  const tables = connection.sqlite.prepare(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name IN ('virtual_folders', 'virtual_folder_items')`
  ).all();
  expect(tables).toEqual([]);
});

it('advances existing v49 databases without creating legacy virtual folder tables', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.pragma('user_version = 49');

  initializeDatabaseConnection(connection);

  const tables = connection.sqlite
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name IN ('virtual_folders', 'virtual_folder_items')
       ORDER BY name ASC`
    )
    .all() as Array<{ name: string }>;
  expect(tables).toEqual([]);
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
});

it('does not delete legacy development tables that already exist', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec('CREATE TABLE virtual_folders (id TEXT PRIMARY KEY)');
  connection.sqlite.exec('CREATE TABLE virtual_folder_items (id TEXT PRIMARY KEY)');
  connection.sqlite.pragma('user_version = 49');

  initializeDatabaseConnection(connection);

  const tables = connection.sqlite.prepare(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name IN ('virtual_folders', 'virtual_folder_items')
     ORDER BY name ASC`
  ).all() as Array<{ name: string }>;
  expect(tables).toEqual([{ name: 'virtual_folder_items' }, { name: 'virtual_folders' }]);
});

it('keeps virtual folder tables out of sync object policies', () => {
  const syncedStorage = SYNC_OBJECT_POLICIES.flatMap((policy) => policy.storage);

  expect(syncedStorage).not.toContain('virtual_folders');
  expect(syncedStorage).not.toContain('virtual_folder_items');
  expect(SYNC_OBJECT_POLICIES.map((policy) => policy.objectType)).not.toContain('virtual_folder');
});
