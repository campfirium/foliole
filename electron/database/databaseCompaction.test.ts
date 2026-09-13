// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-database-compaction';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('electron', () => ({ shell: { trashItem: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('./backupFileDisposition.js', () => ({
  moveManagedBackupToTrash: vi.fn().mockResolvedValue(undefined)
}));

import { loadBackupSettings } from './backupSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { compactApplicationDatabase, loadApplicationDatabaseSpaceStatus } from './databaseCompaction.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-database-compaction-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('reports zero or positive reclaimable space from SQLite page state', async () => {
  await expect(loadApplicationDatabaseSpaceStatus()).resolves.toMatchObject({
    reclaimable_bytes: 0,
    reclaimable_percent: 0
  });
  createFreePages();
  const status = await loadApplicationDatabaseSpaceStatus();
  expect(status.database_size_bytes).toBeGreaterThan(0);
  expect(status.reclaimable_bytes).toBeGreaterThan(0);
  expect(status.reclaimable_percent).toBeGreaterThan(0);
});

it('compacts the database, preserves data, and keeps a verified Safety snapshot', async () => {
  createFreePages();
  const before = await loadApplicationDatabaseSpaceStatus();

  const result = await compactApplicationDatabase();

  expect(result.before).toEqual(before);
  expect(result.after.database_size_bytes).toBeLessThan(before.database_size_bytes);
  expect(result.after.reclaimable_bytes).toBe(0);
  expect(openDatabaseConnection().sqlite.prepare('SELECT COUNT(*) AS count FROM compact_fixture').get())
    .toEqual({ count: 10 });
  await expect(fs.access(result.safety_snapshot_path)).resolves.toBeUndefined();
  expect((await fs.readdir(path.dirname(openDatabaseConnection().dbPath)))
    .some((name) => name.startsWith('.foliole-compact-'))).toBe(false);
});

it('keeps the main database bytes and availability unchanged when replacement fails', async () => {
  createFreePages();
  const connection = openDatabaseConnection();
  loadBackupSettings();
  connection.sqlite.pragma('wal_checkpoint(TRUNCATE)');
  const databasePath = connection.dbPath;
  const before = await fs.readFile(databasePath);
  vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('injected atomic replacement failure'));

  await expect(compactApplicationDatabase()).rejects.toThrow('current library has been restored');

  expect(await fs.readFile(databasePath)).toEqual(before);
  expect(openDatabaseConnection().sqlite.prepare('SELECT COUNT(*) AS count FROM compact_fixture').get())
    .toEqual({ count: 10 });
  expect((await fs.readdir(path.dirname(databasePath)))
    .some((name) => name.startsWith('.foliole-compact-'))).toBe(false);
}, 15_000);

function createFreePages() {
  const sqlite = openDatabaseConnection().sqlite;
  sqlite.exec('CREATE TABLE compact_fixture (id INTEGER PRIMARY KEY, payload BLOB NOT NULL)');
  const insert = sqlite.prepare('INSERT INTO compact_fixture(payload) VALUES (?)');
  const write = sqlite.transaction(() => {
    for (let index = 0; index < 1200; index += 1) insert.run(Buffer.alloc(4096, index % 251));
  });
  write();
  sqlite.prepare('DELETE FROM compact_fixture WHERE id > 10').run();
  sqlite.pragma('wal_checkpoint(TRUNCATE)');
}
