// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-tests-appdata';

vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { loadAppSettingsState, saveAppSettingsState } from './storage.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-storage-test-'));
  mockedAppDataDir = path.join(tempRoot, 'config', 'Foliole');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('persists app settings state into sqlite settings table', async () => {
  await saveAppSettingsState({
    'foliole-ui-font-preset': 'inter',
    'foliole-interface-font-size': '18'
  });

  await expect(loadAppSettingsState()).resolves.toEqual({
    'foliole-ui-font-preset': 'inter',
    'foliole-interface-font-size': '18'
  });

  const row = openDatabaseConnection().sqlite
    .prepare('SELECT key, value FROM settings WHERE key = ?')
    .get('app_settings') as { key: string; value: string } | undefined;
  expect(row?.key).toBe('app_settings');
});

it('returns empty object when sqlite payload is malformed json', async () => {
  openDatabaseConnection().sqlite
    .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run('app_settings', '{bad-json', '2026-03-06T00:00:00.000Z');

  await expect(loadAppSettingsState()).resolves.toEqual({});
});

it('filters malformed app settings payload values', async () => {
  openDatabaseConnection().sqlite
    .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run(
      'app_settings',
      JSON.stringify({
        'foliole-ui-font-preset': 'inter',
        'bad key with spaces': 'x',
        'foliole-interface-font-size': 18
      }),
      '2026-03-06T00:00:00.000Z'
    );

  await expect(loadAppSettingsState()).resolves.toEqual({
    'foliole-ui-font-preset': 'inter'
  });
});
