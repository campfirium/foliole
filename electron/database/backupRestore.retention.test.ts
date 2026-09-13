// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-backup-retention-tests';
let mockedDocumentsDir = '/tmp/foliole-backup-retention-documents';
const notificationMocks = vi.hoisted(() => ({ show: vi.fn() }));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('./backupCleanupNotification.js', () => ({
  showBackupCleanupNotification: notificationMocks.show
}));
vi.mock('./backupFileDisposition.js', () => ({
  moveManagedBackupToTrash: async (filePath: string) => {
    const { rm } = await import('node:fs/promises');
    await rm(filePath, { force: true });
  }
}));

import { listManagedDatabaseBackups, pruneManagedDatabaseBackups } from './backupCatalog.js';
import { reconcileAutomaticDatabaseBackups } from './backupRestore.js';
import { loadBackupSettings, resolveManagedBackupDirectory, saveBackupSettings } from './backupSettings.js';
import { closeDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  vi.clearAllMocks();
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-backup-retention-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('creates one automatic restore point for all enabled retention layers', async () => {
  saveBackupSettings({
    daily_max_count: 7,
    hourly_max_count: 24,
    monthly_max_count: 0,
    weekly_max_count: 4
  });

  await reconcileAutomaticDatabaseBackups(new Date(2026, 3, 2, 10, 15, 0));
  const backupNames = (await fs.readdir(resolveManagedBackupDirectory(loadBackupSettings()))).sort();

  expect(backupNames).toEqual(['foliole-auto-backup-260402-101500.db.gz']);
});

it('uses the finest enabled layer as the only automatic backup cadence', async () => {
  saveBackupSettings({
    daily_max_count: 7,
    hourly_max_count: 24,
    monthly_max_count: 0,
    weekly_max_count: 4
  });

  await reconcileAutomaticDatabaseBackups(new Date(2026, 3, 2, 10, 15, 0));
  await reconcileAutomaticDatabaseBackups(new Date(2026, 3, 2, 10, 45, 0));
  await reconcileAutomaticDatabaseBackups(new Date(2026, 3, 2, 11, 5, 0));

  const backupNames = (await fs.readdir(resolveManagedBackupDirectory(loadBackupSettings()))).sort();
  expect(backupNames).toEqual([
    'foliole-auto-backup-260402-101500.db.gz',
    'foliole-auto-backup-260402-110500.db.gz'
  ]);
});

it('falls back to daily cadence when hourly retention is disabled', async () => {
  saveBackupSettings({
    daily_max_count: 7,
    hourly_max_count: 0,
    monthly_max_count: 0,
    weekly_max_count: 4
  });

  await reconcileAutomaticDatabaseBackups(new Date(2026, 3, 2, 10, 15, 0));
  await reconcileAutomaticDatabaseBackups(new Date(2026, 3, 2, 18, 15, 0));
  await reconcileAutomaticDatabaseBackups(new Date(2026, 3, 3, 9, 0, 0));

  const backupNames = (await fs.readdir(resolveManagedBackupDirectory(loadBackupSettings()))).sort();
  expect(backupNames).toEqual([
    'foliole-auto-backup-260402-101500.db.gz',
    'foliole-auto-backup-260403-090000.db.gz'
  ]);
});

it.each([
  {
    first: new Date(2026, 3, 6, 10, 0),
    name: 'weekly',
    next: new Date(2026, 3, 13, 10, 0),
    same: new Date(2026, 3, 12, 18, 0),
    settings: { daily_max_count: 0, hourly_max_count: 0, monthly_max_count: 0, weekly_max_count: 4 }
  },
  {
    first: new Date(2026, 3, 6, 10, 0),
    name: 'monthly',
    next: new Date(2026, 4, 1, 10, 0),
    same: new Date(2026, 3, 30, 18, 0),
    settings: { daily_max_count: 0, hourly_max_count: 0, monthly_max_count: 3, weekly_max_count: 0 }
  }
])('uses $name cadence when it is the finest enabled layer', async ({ first, next, same, settings }) => {
  saveBackupSettings(settings);

  await reconcileAutomaticDatabaseBackups(first);
  await reconcileAutomaticDatabaseBackups(same);
  await reconcileAutomaticDatabaseBackups(next);

  const backupNames = await fs.readdir(resolveManagedBackupDirectory(loadBackupSettings()));
  expect(backupNames).toHaveLength(2);
});

it('does not create automatic restore points when every layer is disabled', async () => {
  saveBackupSettings({
    daily_max_count: 0,
    hourly_max_count: 0,
    monthly_max_count: 0,
    weekly_max_count: 0
  });

  await reconcileAutomaticDatabaseBackups(new Date(2026, 3, 6, 10, 0));

  expect(await fs.readdir(resolveManagedBackupDirectory(loadBackupSettings()))).toEqual([]);
});

it('does not overwrite an existing automatic restore point in the same second', async () => {
  const now = new Date(2026, 3, 6, 10, 15, 0);
  saveBackupSettings({ hourly_max_count: 24 });
  const backupDirectory = resolveManagedBackupDirectory(loadBackupSettings());
  await fs.mkdir(backupDirectory, { recursive: true });
  await createBackupFixture(
    backupDirectory,
    'foliole-auto-backup-260406-101500.db',
    'existing',
    now.toISOString()
  );

  await reconcileAutomaticDatabaseBackups(now);

  await expect(fs.readFile(path.join(backupDirectory, 'foliole-auto-backup-260406-101500.db'), 'utf8'))
    .resolves.toBe('existing');
});

it('treats legacy frequency files as one shared restore point collection', async () => {
  const now = new Date(2026, 3, 6, 10, 15, 0);
  saveBackupSettings({
    daily_max_count: 7,
    hourly_max_count: 24,
    monthly_max_count: 1,
    weekly_max_count: 4
  });
  const backupDirectory = resolveManagedBackupDirectory(loadBackupSettings());
  await fs.mkdir(backupDirectory, { recursive: true });
  for (const frequency of ['daily', 'hourly', 'monthly', 'weekly']) {
    await createBackupFixture(
      backupDirectory,
      `auto-${frequency}-2026-04-06_10-15-00-000.db`,
      frequency,
      now.toISOString()
    );
  }

  await reconcileAutomaticDatabaseBackups(now);

  const backupNames = await fs.readdir(backupDirectory);
  expect(backupNames).toEqual(['auto-daily-2026-04-06_10-15-00-000.db']);
  expect(notificationMocks.show).toHaveBeenCalledTimes(1);
  expect(notificationMocks.show).toHaveBeenCalledWith(expect.objectContaining({
    capacityDeletedCount: 0,
    deletedCount: 3,
    policyDeletedCount: 3
  }));
});

it('keeps the newest ordinary backup and configured safety snapshot at the capacity floor', async () => {
  saveBackupSettings({
    daily_max_count: 0,
    hourly_max_count: 0,
    monthly_max_count: 0,
    weekly_max_count: 0,
    safety_max_count: 1,
    total_size_limit_bytes: 20
  });
  const backupDirectory = resolveManagedBackupDirectory(loadBackupSettings());
  await fs.mkdir(backupDirectory, { recursive: true });

  await createBackupFixture(backupDirectory, 'manual-2026-04-02_10-00-00-000.db', 'aaaaaaaaaa', '2026-04-02T10:00:00.000Z');
  await createBackupFixture(backupDirectory, 'manual-2026-04-02_11-00-00-000.db', 'bbbbbbbbbb', '2026-04-02T11:00:00.000Z');
  await createBackupFixture(backupDirectory, 'manual-2026-04-02_12-00-00-000.db', 'cccccccccc', '2026-04-02T12:00:00.000Z');
  await createBackupFixture(backupDirectory, 'pre-restore-2026-04-02_13-00-00-000.db', 'dddddddddd', '2026-04-02T13:00:00.000Z');
  await createBackupFixture(backupDirectory, 'pre-restore-2026-04-02_14-00-00-000.db', 'eeeeeeeeee', '2026-04-02T14:00:00.000Z');

  const settings = loadBackupSettings();
  const result = await pruneManagedDatabaseBackups(
    backupDirectory,
    settings,
    { disposeFile: async (filePath) => fs.rm(filePath, { force: true }) }
  );
  const entries = await listManagedDatabaseBackups(backupDirectory);

  expect(result).toEqual({
    capacityDeletedCount: 0,
    deletedCount: 3,
    failedCount: 0,
    policyDeletedCount: 3,
    releasedBytes: 30
  });
  expect(entries.map((entry) => entry.fileName)).toEqual([
    'pre-restore-2026-04-02_14-00-00-000.db',
    'manual-2026-04-02_12-00-00-000.db'
  ]);
});

async function createBackupFixture(
  directoryPath: string,
  fileName: string,
  content: string,
  updatedAt: string
) {
  const filePath = path.join(directoryPath, fileName);
  await fs.writeFile(filePath, content);
  await fs.utimes(filePath, new Date(updatedAt), new Date(updatedAt));
}
