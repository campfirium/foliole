// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { NativeBackupSettings } from '../../lib/platform/nativeUtilityContract.js';

import { listManagedDatabaseBackups, pruneManagedDatabaseBackups } from './backupCatalog.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { createManagedSafetySnapshotWithBackup } from './managedSafetySnapshots.js';
import { initializeDatabase } from './migrate.js';

let mockedAppDataDir = '/tmp/foliole-safety-retention-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

let tempRoot = '';
let backupDirectory = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-safety-retention-'));
  backupDirectory = path.join(tempRoot, 'Backups');
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  await fs.mkdir(backupDirectory, { recursive: true });
  initializeDatabase();
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('keeps the latest completed safety snapshot even when the directory remains over its size limit', async () => {
  await writeFixture('manual-2026-08-12_08-00-00-000.db', 10, '2026-08-12T08:00:00.000Z');
  await writeFixture('pre-restore-2026-08-12_09-00-00-000.db.gz', 30, '2026-08-12T09:00:00.000Z');

  const result = await pruneManagedDatabaseBackups(backupDirectory, settings(5));

  expect(result).toMatchObject({
    capacityDeletedCount: 1,
    deletedCount: 1,
    remainingBytesOverLimit: 25,
    safetySnapshotFloorPreserved: true
  });
  await expect(fs.access(path.join(backupDirectory, 'pre-restore-2026-08-12_09-00-00-000.db.gz')))
    .resolves.toBeUndefined();
});

it('does not let a full-size protected snapshot evict completed restore points', async () => {
  await writeFixture('manual-2026-08-12_08-00-00-000.db', 10, '2026-08-12T08:00:00.000Z');
  await writeFixture('pre-restore-2026-08-12_09-00-00-000.db.gz', 10, '2026-08-12T09:00:00.000Z');
  let continueLink: (() => void) | undefined;
  let reportLinkStarted: (() => void) | undefined;
  const linkStarted = new Promise<void>((resolve) => { reportLinkStarted = resolve; });
  const linkGate = new Promise<void>((resolve) => { continueLink = resolve; });
  const originalLink = fs.link.bind(fs);
  vi.spyOn(fs, 'link').mockImplementation(async (existingPath, newPath) => {
    reportLinkStarted?.();
    await linkGate;
    await originalLink(existingPath, newPath);
  });
  const connection = openDatabaseConnection();
  const pendingSnapshot = createManagedSafetySnapshotWithBackup({
    destinationDirectory: backupDirectory,
    now: new Date('2026-08-12T10:00:00.000Z'),
    reason: 'pre-migration',
    sourceDatabase: connection.sqlite,
    sourcePath: connection.dbPath
  });
  await linkStarted;

  const result = await pruneManagedDatabaseBackups(backupDirectory, settings(20));

  expect(result.deletedCount).toBe(0);
  expect((await listManagedDatabaseBackups(backupDirectory)).map((entry) => entry.fileName))
    .toEqual(expect.arrayContaining([
      'manual-2026-08-12_08-00-00-000.db',
      'pre-restore-2026-08-12_09-00-00-000.db.gz',
      'pre-migration-2026-08-12_10-00-00-000.db'
    ]));
  continueLink?.();
  const snapshot = await pendingSnapshot;
  snapshot.release();
});

it.each(['EBUSY', 'EPERM'])('keeps an occupied restore point and reports only successful %s removals', async (code) => {
  const occupiedName = 'manual-2026-08-12_08-00-00-000.db';
  const removedName = 'manual-2026-08-12_09-00-00-000.db';
  await writeFixture(occupiedName, 10, '2026-08-12T08:00:00.000Z');
  await writeFixture(removedName, 10, '2026-08-12T09:00:00.000Z');
  const occupiedPath = path.join(backupDirectory, occupiedName);
  const originalRm = fs.rm.bind(fs);
  vi.spyOn(fs, 'rm').mockImplementation(async (filePath, options) => {
    if (path.resolve(String(filePath)) === path.resolve(occupiedPath)) {
      throw Object.assign(new Error(code), { code });
    }
    await originalRm(filePath, options);
  });

  const result = await pruneManagedDatabaseBackups(backupDirectory, {
    ...settings(100),
    manual_max_count: 0
  });

  expect(result).toMatchObject({ deletedCount: 1, policyDeletedCount: 1, releasedBytes: 10 });
  await expect(fs.access(occupiedPath)).resolves.toBeUndefined();
  await expect(fs.access(path.join(backupDirectory, removedName))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(listManagedDatabaseBackups(backupDirectory)).resolves.toHaveLength(1);
});

function settings(totalSizeLimitBytes: number): NativeBackupSettings {
  return {
    auto_daily_days: 0, auto_hourly_hours: 0, auto_monthly_months: 0, auto_weekly_weeks: 0,
    backup_dir: backupDirectory, extra_backup_dir: '', extra_backup_max_count: 10,
    manual_max_count: 10, snapshot_max_count: 5,
    total_size_limit_bytes: totalSizeLimitBytes, updated_at: '2026-08-12T00:00:00.000Z'
  };
}

async function writeFixture(fileName: string, size: number, updatedAt: string) {
  const filePath = path.join(backupDirectory, fileName);
  await fs.writeFile(filePath, Buffer.alloc(size, 1));
  await fs.utimes(filePath, new Date(updatedAt), new Date(updatedAt));
}
