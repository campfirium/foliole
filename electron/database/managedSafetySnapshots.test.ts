// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import {
  assertManagedSafetySnapshotIntegrity,
  createManagedSafetySnapshotWithBackup
} from './managedSafetySnapshots.js';
import { initializeDatabase } from './migrate.js';

let mockedAppDataDir = '/tmp/foliole-managed-safety-snapshot-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-managed-safety-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('keeps the complete sqlite snapshot when compression space is unavailable', async () => {
  vi.spyOn(fs, 'statfs').mockResolvedValue({ bavail: 0, bsize: 4096 } as Awaited<ReturnType<typeof fs.statfs>>);

  const snapshot = await createSnapshot();

  expect(snapshot.currentPath).toMatch(/\.db$/);
  await expect(assertManagedSafetySnapshotIntegrity(snapshot.currentPath)).resolves.toBeUndefined();
  snapshot.release();
});

it('removes a corrupt compressed terminal file and keeps the complete sqlite snapshot', async () => {
  const originalLink = fs.link.bind(fs);
  vi.spyOn(fs, 'link').mockImplementation(async (existingPath, newPath) => {
    await originalLink(existingPath, newPath);
    await fs.truncate(newPath, 8);
  });

  const snapshot = await createSnapshot();

  expect(snapshot.currentPath).toMatch(/\.db$/);
  await expect(fs.access(`${snapshot.currentPath}.gz`)).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(assertManagedSafetySnapshotIntegrity(snapshot.currentPath)).resolves.toBeUndefined();
  snapshot.release();
});

async function createSnapshot() {
  const connection = openDatabaseConnection();
  return createManagedSafetySnapshotWithBackup({
    destinationDirectory: path.join(tempRoot, 'Backups'),
    now: new Date('2026-08-12T08:00:00.000Z'),
    reason: 'pre-restore',
    sourceDatabase: connection.sqlite,
    sourcePath: connection.dbPath
  });
}
