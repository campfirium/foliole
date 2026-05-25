// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-backup-extra-tests';
let mockedDocumentsDir = '/tmp/foliole-backup-extra-documents';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createApplicationDatabaseBackup, reconcileAutomaticDatabaseBackups } from './backupRestore.js';
import { loadBackupSettings, normalizeBackupSettings, resolveManagedBackupDirectory, saveBackupSettings } from './backupSettings.js';
import { closeDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-backup-extra-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('normalizes extra backup settings with a disabled path and positive retained count', () => {
  expect(normalizeBackupSettings({ extra_backup_dir: 'relative/path', extra_backup_max_count: 0 })).toEqual(
    expect.objectContaining({
      extra_backup_dir: '',
      extra_backup_max_count: 1
    })
  );
});

it('copies a manual backup into the extra backup location and prunes old extra copies only', async () => {
  const extraDir = path.join(tempRoot, 'CloudBackups');
  await fs.mkdir(extraDir, { recursive: true });
  await createBackupFixture(extraDir, 'manual-2026-04-02_10-00-00-000.db', 'old', '2026-04-02T10:00:00.000Z');
  await createBackupFixture(extraDir, 'manual-2026-04-02_11-00-00-000.db', 'newer', '2026-04-02T11:00:00.000Z');
  await fs.writeFile(path.join(extraDir, 'personal.txt'), 'keep');
  saveBackupSettings({ extra_backup_dir: extraDir, extra_backup_max_count: 2 });

  const result = await createApplicationDatabaseBackup();
  const extraNames = (await fs.readdir(extraDir)).sort();

  expect(result.extraBackup).toEqual({
    destinationPath: path.join(extraDir, path.basename(result.destinationPath)),
    errorMessage: null,
    status: 'copied'
  });
  expect(extraNames).toContain(path.basename(result.destinationPath));
  expect(extraNames).toContain('personal.txt');
  expect(extraNames.filter((fileName) => fileName.endsWith('.db'))).toHaveLength(2);
  expect(extraNames).not.toContain('manual-2026-04-02_10-00-00-000.db');
});

it('keeps the main manual backup when the extra copy fails', async () => {
  const blockedExtraPath = path.join(tempRoot, 'not-a-directory');
  await fs.writeFile(blockedExtraPath, 'file blocks mkdir');
  saveBackupSettings({ extra_backup_dir: blockedExtraPath });

  const result = await createApplicationDatabaseBackup();

  expect(result.extraBackup.status).toBe('failed');
  await expect(fs.stat(result.destinationPath)).resolves.toBeDefined();
});

it('skips extra copying when the extra location matches the main backup location', async () => {
  const backupDir = path.join(tempRoot, 'Backups');
  saveBackupSettings({ backup_dir: backupDir, extra_backup_dir: backupDir, extra_backup_max_count: 1 });

  const result = await createApplicationDatabaseBackup();
  const backupNames = (await fs.readdir(resolveManagedBackupDirectory(loadBackupSettings()))).filter((fileName) => fileName.endsWith('.db'));

  expect(result.extraBackup.status).toBe('skipped_same_directory');
  expect(backupNames).toEqual([path.basename(result.destinationPath)]);
});

it('copies automatic backups into the extra location without blocking primary retention', async () => {
  const extraDir = path.join(tempRoot, 'CloudBackups');
  saveBackupSettings({
    auto_daily_days: 1,
    auto_hourly_hours: 0,
    auto_monthly_months: 0,
    auto_weekly_weeks: 0,
    extra_backup_dir: extraDir
  });

  await reconcileAutomaticDatabaseBackups(new Date('2026-04-02T10:15:00.000Z'));

  await expect(fs.stat(path.join(extraDir, 'auto-daily-2026-04-02_10-15-00-000.db'))).resolves.toBeDefined();
});

async function createBackupFixture(directoryPath: string, fileName: string, content: string, updatedAt: string) {
  const filePath = path.join(directoryPath, fileName);
  await fs.writeFile(filePath, content);
  await fs.utimes(filePath, new Date(updatedAt), new Date(updatedAt));
}
