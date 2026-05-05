// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-integrity-tests';
let mockedDocumentsDir = '/tmp/foliole-integrity-documents';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { DATABASE_SCHEMA_VERSION } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection, resolveDatabasePath } from './connection.js';
import { moveDatabaseToPreRebuildSnapshot } from './integrity.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-integrity-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('quarantines a malformed sqlite database and recreates an empty schema on initialize', async () => {
  const databasePath = resolveDatabasePath();
  await fs.mkdir(path.dirname(databasePath), { recursive: true });
  await fs.writeFile(databasePath, 'not-a-sqlite-database');

  const recoveredConnection = initializeDatabase();
  const recoveryDir = path.join(mockedDocumentsDir, 'Foliole', 'Data', 'recovery');
  const recoveredEntries = await fs.readdir(recoveryDir);
  const recoveredDatabaseName = recoveredEntries.find((entry) => entry.endsWith('.db'));

  expect(recoveredConnection.sqlite.prepare('PRAGMA quick_check(1)').pluck().get()).toBe('ok');
  expect(recoveredConnection.sqlite.prepare('PRAGMA user_version').pluck().get()).toBe(DATABASE_SCHEMA_VERSION);
  expect(recoveredDatabaseName).toMatch(/^foliole-corrupt-.*\.db$/);
  expect(
    await fs.readFile(path.join(recoveryDir, recoveredDatabaseName ?? ''), 'utf8')
  ).toBe('not-a-sqlite-database');
});

it('moves legacy development databases to a pre-rebuild snapshot before recreating schema', async () => {
  const databasePath = resolveDatabasePath();
  const legacyConnection = openDatabaseConnection();
  legacyConnection.sqlite.exec(`
    CREATE TABLE legacy_marker (
      value TEXT NOT NULL
    );
    INSERT INTO legacy_marker (value) VALUES ('kept legacy row');
  `);
  legacyConnection.sqlite.pragma('user_version = 12');
  closeDatabaseConnection();

  const stages: string[] = [];
  const rebuiltConnection = initializeDatabase((stage) => stages.push(stage));
  const preRebuildDir = path.join(path.dirname(databasePath), 'pre-rebuild');
  const snapshotTimestamps = await fs.readdir(preRebuildDir);
  const snapshotPath = path.join(preRebuildDir, snapshotTimestamps[0] ?? '', path.basename(databasePath));

  expect(stages).toContain('database_legacy_rebuild_snapshot_created');
  expect(rebuiltConnection.sqlite.prepare('PRAGMA user_version').pluck().get()).toBe(DATABASE_SCHEMA_VERSION);
  expect(await fs.readFile(snapshotPath)).toEqual(expect.any(Buffer));
});

it('moves sqlite sidecar files into the pre-rebuild snapshot directory', async () => {
  const databasePath = path.join(tempRoot, 'legacy-sidecars', 'foliole.db');
  const snapshotTime = new Date('2026-04-26T00:00:00.000Z');
  await fs.mkdir(path.dirname(databasePath), { recursive: true });
  await fs.writeFile(databasePath, 'db');
  await fs.writeFile(`${databasePath}-wal`, 'wal');
  await fs.writeFile(`${databasePath}-shm`, 'shm');
  await fs.writeFile(`${databasePath}-journal`, 'journal');

  const snapshot = moveDatabaseToPreRebuildSnapshot(databasePath, snapshotTime);

  expect(await fs.readFile(snapshot.snapshotPath, 'utf8')).toBe('db');
  expect(await fs.readFile(`${snapshot.snapshotPath}-wal`, 'utf8')).toBe('wal');
  expect(await fs.readFile(`${snapshot.snapshotPath}-shm`, 'utf8')).toBe('shm');
  expect(await fs.readFile(`${snapshot.snapshotPath}-journal`, 'utf8')).toBe('journal');
  await expect(fs.access(databasePath)).rejects.toMatchObject({ code: 'ENOENT' });
});
