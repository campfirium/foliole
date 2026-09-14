// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: appDataDir,
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_log_dir: path.join(appDataDir, 'logs')
  })
}));

import { loadBackupSettings, saveBackupSettings } from './backupSettings.js';
import { closeDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';

beforeEach(async () => {
  appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-backup-settings-'));
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(appDataDir, { recursive: true, force: true });
});

it('persists a priority override through the real settings store', () => {
  expect(loadBackupSettings().retention_priority).toEqual([
    'hourly', 'daily', 'weekly', 'monthly'
  ]);

  saveBackupSettings({
    retention_priority: ['monthly', 'hourly', 'daily', 'weekly']
  });

  expect(loadBackupSettings()).toMatchObject({
    overridden_fields: ['retention_priority'],
    retention_priority: ['monthly', 'hourly', 'daily', 'weekly']
  });
});
