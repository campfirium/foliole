// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-backup-idle-proof-tests';
let mockedDocumentsDir = '/tmp/foliole-backup-idle-proof-documents';
const copies = vi.hoisted(() => ({ count: 0, bytes: 0 }));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('./backupCleanupNotification.js', () => ({ showBackupCleanupNotification: vi.fn() }));
vi.mock('./backupFileDisposition.js', () => ({
  moveManagedBackupToTrash: (filePath: string) => fs.rm(filePath, { force: true })
}));
vi.mock('./sqliteFileOffMainThread.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./sqliteFileOffMainThread.js')>();
  return { ...actual, backupSqliteFileOffMainThread: async (...args: Parameters<typeof actual.backupSqliteFileOffMainThread>) => {
    const result = await actual.backupSqliteFileOffMainThread(...args);
    copies.count += 1;
    copies.bytes += (await fs.stat(args[1])).size;
    return result;
  } };
});

import { readOwnWriteCounter } from './automaticBackupProof.js';
import { reconcileAutomaticDatabaseBackups } from './backupRestore.js';
import { loadBackupSettings, resolveManagedBackupDirectory, saveBackupSettings } from './backupSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { saveJsonSetting } from './settingsStore.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-backup-idle-proof-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
  saveBackupSettings({ daily_max_count: 0, hourly_max_count: 5, monthly_max_count: 0, weekly_max_count: 0 });
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

const hour = (value: number) => new Date(2026, 3, 2, value, 0);

/** Library copies made by one automatic backup cycle, and the restore points it leaves. */
async function cycle(at: number) {
  copies.count = 0;
  copies.bytes = 0;
  await reconcileAutomaticDatabaseBackups(hour(at));
  return { copies: copies.count, restorePoints: await ordinaryBackupNames() };
}

async function ordinaryBackupNames() {
  const directory = resolveManagedBackupDirectory(loadBackupSettings());
  return (await fs.readdir(directory)).filter((name) => name.startsWith('foliole-auto-')).sort();
}

async function latestRestorePointPath() {
  const names = await ordinaryBackupNames();
  return path.join(resolveManagedBackupDirectory(loadBackupSettings()), names.at(-1)!);
}

it('copies nothing in later cycles while the library stays as last backed up', async () => {
  expect((await cycle(10)).copies).toBe(1);
  expect(copies.bytes).toBeGreaterThan(0);
  const first = await ordinaryBackupNames();

  expect(await cycle(11)).toEqual({ copies: 0, restorePoints: first });
  expect(await cycle(12)).toEqual({ copies: 0, restorePoints: first });

  saveJsonSetting('backup-idle-proof-change', { revision: 1 });
  const changed = await cycle(13);
  expect(changed.copies).toBe(1);
  expect(changed.restorePoints).toHaveLength(2);
  expect(await cycle(14)).toEqual({ copies: 0, restorePoints: changed.restorePoints });
});

it('notices a write by its own connection without relying on file times', () => {
  const connection = openDatabaseConnection();
  const before = readOwnWriteCounter(connection);
  saveJsonSetting('backup-idle-proof-own-write', { revision: 1 });
  const written = readOwnWriteCounter(connection);
  expect(written).not.toBe(before);
  connection.sqlite.exec('CREATE TABLE own_schema_change (value TEXT)');
  expect(readOwnWriteCounter(connection)).not.toBe(written);
});

it('backs up a write committed by another connection', async () => {
  await cycle(10);
  const other = new Database(openDatabaseConnection().dbPath);
  try { other.exec('CREATE TABLE written_elsewhere (value TEXT); INSERT INTO written_elsewhere VALUES (1)'); }
  finally { other.close(); }

  const next = await cycle(11);
  expect(next.copies).toBe(1);
  expect(next.restorePoints).toHaveLength(2);
});

it('backs up again when the last restore point is damaged or removed', async () => {
  await cycle(10);
  const latest = await latestRestorePointPath();
  const { mtime, size } = await fs.stat(latest);
  await fs.writeFile(latest, Buffer.alloc(size, 7));
  await fs.utimes(latest, mtime, mtime);
  expect((await cycle(11)).restorePoints).toHaveLength(2);

  await fs.rm(await latestRestorePointPath());
  await fs.rm(latest);
  expect(await cycle(12)).toMatchObject({ copies: 1, restorePoints: ['foliole-auto-260402-120000.db.gz'] });
});

it('compares against the restore point again after the library is reopened', async () => {
  const first = (await cycle(10)).restorePoints;
  // Closing checkpoints the WAL into the library file; the content stays the same.
  closeDatabaseConnection();
  openDatabaseConnection();

  expect(await cycle(11)).toEqual({ copies: 1, restorePoints: first });
  expect(await cycle(12)).toEqual({ copies: 0, restorePoints: first });
});
