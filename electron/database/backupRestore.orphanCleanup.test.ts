// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-backup-orphan-cleanup-tests';
let mockedDocumentsDir = '/tmp/foliole-backup-orphan-cleanup-documents';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { reconcileAutomaticDatabaseBackups } from './backupRestore.js';
import { loadBackupSettings, resolveManagedBackupDirectory, saveBackupSettings } from './backupSettings.js';
import { closeDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-backup-orphan-cleanup-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('reclaims interrupted private compression files before creating the next restore point', async () => {
  saveBackupSettings({ auto_hourly_hours: 24 });
  const backupDirectory = resolveManagedBackupDirectory(loadBackupSettings());
  const orphanName = '.foliole-auto-backup-260402-100000.db.gz-11111111-1111-4111-8111-111111111111.source.db';
  await fs.mkdir(backupDirectory, { recursive: true });
  await fs.writeFile(path.join(backupDirectory, orphanName), Buffer.alloc(13));
  await fs.writeFile(path.join(backupDirectory, 'manual-2026-04-02_09-00-00-000.db'), 'formal');

  await expect(reconcileAutomaticDatabaseBackups(new Date(2026, 3, 2, 10, 15, 0))).resolves.toEqual({
    deletedCount: 1,
    releasedBytes: 13
  });
  expect((await fs.readdir(backupDirectory)).sort()).toEqual([
    'foliole-auto-backup-260402-101500.db.gz',
    'manual-2026-04-02_09-00-00-000.db'
  ]);
});
