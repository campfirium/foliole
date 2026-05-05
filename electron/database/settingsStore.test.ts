// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-settings-store-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-settings-store-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('reads saved json payload from sqlite settings', () => {
  saveJsonSetting('window_state', { width: 1400, height: 900, isMaximized: false }, '2026-03-06T00:00:00.000Z');

  expect(loadJsonSetting('window_state')).toEqual({
    width: 1400,
    height: 900,
    isMaximized: false
  });
});

it('returns null for malformed json payload in sqlite settings', () => {
  openDatabaseConnection().sqlite
    .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run('window_state', '{bad-json', '2026-03-06T00:00:00.000Z');

  expect(loadJsonSetting('window_state')).toBeNull();
});

it('overwrites existing key with upsert and keeps a single row', () => {
  saveJsonSetting('app_settings', { theme: 'light' }, '2026-03-06T00:00:00.000Z');
  saveJsonSetting('app_settings', { theme: 'dark' }, '2026-03-06T00:01:00.000Z');

  expect(loadJsonSetting('app_settings')).toEqual({ theme: 'dark' });

  const connection = openDatabaseConnection();
  const row = connection.sqlite
    .prepare('SELECT COUNT(*) AS count FROM settings WHERE key = ?')
    .get('app_settings') as { count: number };
  expect(row.count).toBe(1);
});
