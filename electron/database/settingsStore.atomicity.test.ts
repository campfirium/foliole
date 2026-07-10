// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-settings-store-atomicity-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { saveJsonSetting } from './settingsStore.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-settings-atomicity-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  saveJsonSetting('device_id', 'desktop-device', '2026-07-10T00:00:00.000Z');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('rolls back canonical record and dirty state when projection write fails', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`CREATE TRIGGER fail_app_settings_projection
    BEFORE INSERT ON settings WHEN NEW.key = 'app_settings'
    BEGIN SELECT RAISE(ABORT, 'projection failed'); END`);

  expect(() => saveJsonSetting('app_settings', { theme: 'dark' }, '2026-07-10T00:01:00.000Z'))
    .toThrow(/projection failed/i);

  expect(connection.driver.queryOne('SELECT key FROM settings WHERE key = ?', ['app_settings'])).toBeUndefined();
  expect(connection.driver.queryOne('SELECT key FROM setting_records WHERE key = ?', ['app_settings'])).toBeUndefined();
  expect(connection.driver.queryOne(
    `SELECT object_id FROM sync_object_state WHERE object_type = 'setting' AND object_id LIKE '%:app_settings'`
  )).toBeUndefined();
});

it('keeps local-only saves outside canonical setting state', () => {
  saveJsonSetting('watch_import_cursor_state', { cursor: 'local' }, '2026-07-10T00:02:00.000Z');
  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne('SELECT key FROM settings WHERE key = ?', ['watch_import_cursor_state'])).toBeDefined();
  expect(driver.queryOne('SELECT key FROM setting_records WHERE key = ?', ['watch_import_cursor_state'])).toBeUndefined();
});
