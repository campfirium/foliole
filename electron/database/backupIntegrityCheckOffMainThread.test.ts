// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-backup-integrity-check-tests';
let mockedDocumentsDir = '/tmp/foliole-backup-integrity-check-documents';
const backgroundCheck = vi.hoisted(() => ({ verify: vi.fn<(filePath: string) => Promise<void>>() }));

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
vi.mock('./sqliteFileOffMainThread.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('./sqliteFileOffMainThread.js')>(),
  verifySqliteDatabaseFileOffMainThread: backgroundCheck.verify
}));

import { createApplicationDatabaseBackup, reconcileAutomaticDatabaseBackups } from './backupRestore.js';
import { inspectBackupRestoreSync } from './backupRestoreSyncPreview.js';
import { loadBackupSettings, resolveManagedBackupDirectory, saveBackupSettings } from './backupSettings.js';
import { closeDatabaseConnection } from './connection.js';
import { DatabaseIntegrityError } from './integrity.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  backgroundCheck.verify.mockReset().mockResolvedValue(undefined);
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-backup-integrity-check-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
  saveBackupSettings({ daily_max_count: 0, hourly_max_count: 1, monthly_max_count: 0, weekly_max_count: 0 });
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function failBackgroundCheck() {
  backgroundCheck.verify.mockRejectedValue(new DatabaseIntegrityError('sqlite quick_check failed: corrupt'));
}

async function restorePoints() {
  const names = await fs.readdir(resolveManagedBackupDirectory(loadBackupSettings())).catch(() => []);
  return names.filter((name) => name.endsWith('.db.gz') && !name.startsWith('.'));
}

it('keeps no manual restore point when the background integrity check fails', async () => {
  failBackgroundCheck();

  await expect(createApplicationDatabaseBackup()).rejects.toThrow(DatabaseIntegrityError);
  expect(await restorePoints()).toEqual([]);
});

it('commits a manual restore point only after the background integrity check settles', async () => {
  let release = () => {};
  backgroundCheck.verify.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));

  const backup = createApplicationDatabaseBackup();
  await vi.waitFor(() => expect(backgroundCheck.verify).toHaveBeenCalledTimes(1));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(await restorePoints()).toEqual([]);
  release();

  await expect(backup).resolves.toMatchObject({ destinationPath: expect.stringMatching(/\.db\.gz$/) });
  expect(await restorePoints()).toHaveLength(1);
});

it('rejects a direct backup copy when the background integrity check fails', async () => {
  failBackgroundCheck();

  await expect(createApplicationDatabaseBackup({ destinationPath: path.join(tempRoot, 'copy.db') }))
    .rejects.toThrow(DatabaseIntegrityError);
});

it('keeps no automatic restore point when the background integrity check fails', async () => {
  failBackgroundCheck();

  await expect(reconcileAutomaticDatabaseBackups(new Date(2026, 3, 2, 10, 0))).rejects.toThrow(DatabaseIntegrityError);
  expect(await restorePoints()).toEqual([]);
});

it('refuses to preview a backup whose background integrity check fails', async () => {
  backgroundCheck.verify.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
  const backup = await createApplicationDatabaseBackup();
  failBackgroundCheck();

  await expect(inspectBackupRestoreSync(backup.destinationPath)).rejects.toThrow(DatabaseIntegrityError);
});
