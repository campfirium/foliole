// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-backup-retention-tests';
let mockedDocumentsDir = '/tmp/foliole-backup-retention-documents';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import {
  listApplicationDatabaseBackups,
  reconcileAutomaticDatabaseBackups
} from './backupRestore.js';
import { loadBackupSettings, resolveManagedBackupDirectory, saveBackupSettings } from './backupSettings.js';
import { closeDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-backup-retention-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('creates one automatic backup for each enabled time bucket', async () => {
  saveBackupSettings({
    auto_daily_days: 7,
    auto_hourly_hours: 24,
    auto_monthly_months: 0,
    auto_weekly_weeks: 4
  });

  await reconcileAutomaticDatabaseBackups(new Date('2026-04-02T10:15:00.000Z'));
  const backupNames = (await fs.readdir(resolveManagedBackupDirectory(loadBackupSettings()))).sort();

  expect(backupNames).toEqual([
    'auto-daily-2026-04-02_10-15-00-000.db',
    'auto-hourly-2026-04-02_10-15-00-000.db',
    'auto-weekly-2026-04-02_10-15-00-000.db'
  ]);
});

it('prunes backups by kind rules and then removes the oldest retained backup when total size is exceeded', async () => {
  saveBackupSettings({
    auto_daily_days: 0,
    auto_hourly_hours: 0,
    auto_monthly_months: 0,
    auto_weekly_weeks: 0,
    manual_max_count: 2,
    snapshot_max_count: 1,
    total_size_limit_bytes: 20
  });
  const backupDirectory = resolveManagedBackupDirectory(loadBackupSettings());
  await fs.mkdir(backupDirectory, { recursive: true });

  await createBackupFixture(backupDirectory, 'manual-2026-04-02_10-00-00-000.db', 'aaaaaaaaaa', '2026-04-02T10:00:00.000Z');
  await createBackupFixture(backupDirectory, 'manual-2026-04-02_11-00-00-000.db', 'bbbbbbbbbb', '2026-04-02T11:00:00.000Z');
  await createBackupFixture(backupDirectory, 'manual-2026-04-02_12-00-00-000.db', 'cccccccccc', '2026-04-02T12:00:00.000Z');
  await createBackupFixture(backupDirectory, 'pre-restore-2026-04-02_13-00-00-000.db', 'dddddddddd', '2026-04-02T13:00:00.000Z');
  await createBackupFixture(backupDirectory, 'pre-restore-2026-04-02_14-00-00-000.db', 'eeeeeeeeee', '2026-04-02T14:00:00.000Z');

  const entries = await listApplicationDatabaseBackups();

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
