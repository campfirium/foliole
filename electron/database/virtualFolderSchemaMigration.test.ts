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

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { migrateLegacyVirtualFoldersToManualNodes } from '../../lib/core/database/numberedMigrationManualVirtualFolders.js';
import { parseManualChildOrder } from '../../lib/core/nodes/manualChildOrder.js';
import { isManualVirtualNodeFilter, parseVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter.js';
import { SYNC_OBJECT_POLICIES } from '../../lib/core/sync/syncObjectPolicy.js';

import { closeDatabaseConnection, openDatabaseConnection, type SqliteDatabase } from './connection.js';
import { migrateNumberedFixtureTo } from './numberedMigrationTestSupport.js';

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

  migrateNumberedFixtureTo(connection.sqlite, 50);

  const tables = connection.sqlite
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name IN ('virtual_folders', 'virtual_folder_items')
       ORDER BY name ASC`
    )
    .all() as Array<{ name: string }>;
  expect(tables).toEqual([]);
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(50);
});

it('does not delete legacy development tables that already exist', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec('CREATE TABLE virtual_folders (id TEXT PRIMARY KEY)');
  connection.sqlite.exec('CREATE TABLE virtual_folder_items (id TEXT PRIMARY KEY)');
  connection.sqlite.pragma('user_version = 49');

  migrateNumberedFixtureTo(connection.sqlite, 50);

  const tables = connection.sqlite.prepare(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name IN ('virtual_folders', 'virtual_folder_items')
     ORDER BY name ASC`
  ).all() as Array<{ name: string }>;
  expect(tables).toEqual([{ name: 'virtual_folder_items' }, { name: 'virtual_folders' }]);
});

function seedLegacyVirtualFolders(sqlite: SqliteDatabase) {
  sqlite.exec(`
    CREATE TABLE virtual_folders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE virtual_folder_items (
      id TEXT PRIMARY KEY,
      folder_id TEXT NOT NULL,
      material_node_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    INSERT INTO virtual_folders (id, title, description, created_at, updated_at, deleted_at)
    VALUES
      ('legacy-folder', '英国公司注册流程', '', '2026-07-06T00:00:00.000Z', '2026-07-06T00:01:00.000Z', NULL),
      ('deleted-folder', 'Deleted flow', '', '2026-07-05T00:00:00.000Z', '2026-07-05T00:01:00.000Z',
       '2026-07-05T00:02:00.000Z');
    INSERT INTO virtual_folder_items
      (id, folder_id, material_node_id, position, created_at, updated_at, deleted_at)
    VALUES
      ('item-b', 'legacy-folder', 'topic-b', 20, '2026-07-06T00:00:00.000Z', '2026-07-06T00:00:00.000Z', NULL),
      ('item-a', 'legacy-folder', 'topic-a', 10, '2026-07-06T00:00:00.000Z', '2026-07-06T00:00:00.000Z', NULL),
      ('item-a-duplicate', 'legacy-folder', 'topic-a', 30, '2026-07-06T00:00:00.000Z',
       '2026-07-06T00:00:00.000Z', NULL),
      ('item-deleted', 'legacy-folder', 'topic-deleted', 40, '2026-07-06T00:00:00.000Z',
       '2026-07-06T00:00:00.000Z', '2026-07-06T00:02:00.000Z');
  `);
}

function expectMigratedLegacyVirtualFolders(sqlite: SqliteDatabase) {
  const folder = sqlite.prepare(
    `SELECT id, title, parent_id, manual_child_order, virtual_filter, created_at, updated_at
     FROM nodes WHERE id = 'legacy-folder'`
  ).get() as {
    created_at: string;
    id: string;
    manual_child_order: string | null;
    parent_id: string | null;
    title: string;
    updated_at: string;
    virtual_filter: string | null;
  };
  expect(folder).toMatchObject({
    created_at: '2026-07-06T00:00:00.000Z',
    id: 'legacy-folder',
    parent_id: 'special-virtual-root',
    title: '英国公司注册流程',
    updated_at: '2026-07-06T00:01:00.000Z'
  });
  expect(parseManualChildOrder(folder.manual_child_order)).toEqual(['topic-a', 'topic-b']);
  expect(isManualVirtualNodeFilter(parseVirtualNodeFilter(folder.virtual_filter))).toBe(true);
  const deletedFolder = sqlite.prepare(
    `SELECT title, manual_child_order, deleted_at FROM nodes WHERE id = 'deleted-folder'`
  ).get() as { deleted_at: string | null; manual_child_order: string | null; title: string };
  expect(deletedFolder).toMatchObject({
    deleted_at: '2026-07-05T00:02:00.000Z',
    title: 'Deleted flow'
  });
  expect(parseManualChildOrder(deletedFolder.manual_child_order) ?? []).toEqual([]);
}

it('migrates legacy virtual folders into manual Virtual Folder nodes without Topic YAML', () => {
  const connection = openDatabaseConnection();
  initializeDatabaseConnection(connection);
  seedLegacyVirtualFolders(connection.sqlite);
  connection.sqlite.pragma('user_version = 55');

  migrateNumberedFixtureTo(connection.sqlite, 56);

  expectMigratedLegacyVirtualFolders(connection.sqlite);
  migrateLegacyVirtualFoldersToManualNodes(connection.sqlite);
  expect(connection.sqlite.prepare(
    `SELECT COUNT(*) AS count FROM nodes WHERE id IN ('legacy-folder', 'deleted-folder')`
  ).get()).toEqual({ count: 2 });
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(56);
});

it('keeps virtual folder tables out of sync object policies', () => {
  const syncedStorage = SYNC_OBJECT_POLICIES.flatMap((policy) => policy.storage);

  expect(syncedStorage).not.toContain('virtual_folders');
  expect(syncedStorage).not.toContain('virtual_folder_items');
  expect(SYNC_OBJECT_POLICIES.map((policy) => policy.objectType)).not.toContain('virtual_folder');
});
