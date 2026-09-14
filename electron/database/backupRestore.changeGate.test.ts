// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-backup-change-gate-tests';
let mockedDocumentsDir = '/tmp/foliole-backup-change-gate-documents';
const notifications = vi.hoisted(() => ({ show: vi.fn() }));

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
  showBackupCleanupNotification: notifications.show
}));
vi.mock('./backupFileDisposition.js', () => ({
  moveManagedBackupToTrash: (filePath: string) => fs.rm(filePath, { force: true })
}));

import { createApplicationDatabaseBackup, reconcileAutomaticDatabaseBackups } from './backupRestore.js';
import { loadBackupSettings, resolveManagedBackupDirectory, saveBackupSettings } from './backupSettings.js';
import { closeDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { saveJsonSetting } from './settingsStore.js';

let tempRoot = '';

beforeEach(async () => {
  vi.clearAllMocks();
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-backup-change-gate-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
  saveBackupSettings({ daily_max_count: 0, hourly_max_count: 1, monthly_max_count: 0, weekly_max_count: 0 });
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('does not create, prune, or notify in a later bucket without persisted changes', async () => {
  await reconcileAutomaticDatabaseBackups(new Date(2026, 3, 2, 10, 0));
  const directory = resolveManagedBackupDirectory(loadBackupSettings());
  const [automaticName] = await ordinaryBackupNames();
  if (!automaticName) throw new Error('missing automatic backup fixture');
  await fs.copyFile(
    path.join(directory, automaticName),
    path.join(directory, 'manual-2026-04-01_10-00-00-000.db.gz')
  );
  await fs.utimes(
    path.join(directory, 'manual-2026-04-01_10-00-00-000.db.gz'),
    new Date(2026, 3, 1, 10, 0),
    new Date(2026, 3, 1, 10, 0)
  );
  notifications.show.mockClear();

  await reconcileAutomaticDatabaseBackups(new Date(2026, 3, 2, 11, 0));

  expect(await ordinaryBackupNames()).toHaveLength(2);
  expect(notifications.show).not.toHaveBeenCalled();
});

it('creates once in the next finest bucket after a persisted change', async () => {
  await reconcileAutomaticDatabaseBackups(new Date(2026, 3, 2, 10, 0));
  saveJsonSetting('backup-test-change', { revision: 1 });

  await reconcileAutomaticDatabaseBackups(new Date(2026, 3, 2, 11, 0));
  await reconcileAutomaticDatabaseBackups(new Date(2026, 3, 2, 11, 30));

  expect(await ordinaryBackupNames()).toEqual(['foliole-auto-backup-260402-110000.db.gz']);
});

it('uses a successful managed manual backup as the next automatic change baseline', async () => {
  await createApplicationDatabaseBackup();

  await reconcileAutomaticDatabaseBackups(new Date(2026, 3, 2, 11, 0));

  expect(await ordinaryBackupNames()).toHaveLength(1);
  expect((await ordinaryBackupNames())[0]).toMatch(/^manual-/);
});

async function ordinaryBackupNames() {
  const directory = resolveManagedBackupDirectory(loadBackupSettings());
  return (await fs.readdir(directory)).filter((name) =>
    name.startsWith('foliole-auto-backup-') || name.startsWith('manual-'));
}
