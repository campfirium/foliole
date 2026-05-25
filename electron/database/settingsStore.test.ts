// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY } from '../../lib/core/database/fullTextSearchIndexStrategy.js';

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


it('mirrors syncable settings into setting records and sync object state', () => {
  saveJsonSetting('device_id', 'device-test', '2026-03-06T00:00:00.000Z');
  saveJsonSetting('app_settings', { theme: 'dark' }, '2026-03-06T00:01:00.000Z');
  saveJsonSetting('watch_import_cursor_state', { cursor: 'local' }, '2026-03-06T00:02:00.000Z');
  saveJsonSetting('remote-image-learned-sources-v1', { entries: {} }, '2026-03-06T00:03:00.000Z');

  const connection = openDatabaseConnection();
  const settingRecord = connection.sqlite
    .prepare(
      `SELECT key, scope, platform, form_factor, device_id, value_json
       FROM setting_records WHERE key = ?`
    )
    .get('app_settings') as Record<string, unknown>;
  const syncState = connection.sqlite
    .prepare(
      `SELECT object_type, object_id, last_modified_by_device_id, sync_dirty
       FROM sync_object_state WHERE object_type = 'setting' AND object_id = ?`
    )
    .get('user_space:windows:desktop:*:app_settings') as Record<string, unknown>;
  const localOnlyCount = connection.sqlite
    .prepare('SELECT COUNT(*) AS count FROM setting_records WHERE key = ?')
    .get('watch_import_cursor_state') as { count: number };
  const learnedSourcesCount = connection.sqlite
    .prepare('SELECT COUNT(*) AS count FROM setting_records WHERE key = ?')
    .get('remote-image-learned-sources-v1') as { count: number };
  const changeCount = connection.sqlite
    .prepare(
      `SELECT COUNT(*) AS count
       FROM sync_change_log
       WHERE object_type = 'setting' AND object_id = ?`
    )
    .get('user_space:windows:desktop:*:app_settings') as { count: number };

  expect(settingRecord).toMatchObject({
    device_id: '*',
    form_factor: 'desktop',
    key: 'app_settings',
    platform: 'windows',
    scope: 'user_space',
    value_json: '{"theme":"dark"}'
  });
  expect(syncState).toMatchObject({
    last_modified_by_device_id: 'device-test',
    object_id: 'user_space:windows:desktop:*:app_settings',
    object_type: 'setting',
    sync_dirty: 1
  });
  expect(changeCount.count).toBe(0);
  expect(localOnlyCount.count).toBe(0);
  expect(learnedSourcesCount.count).toBe(0);
});

it('stores full-text search index strategy inside the user-space app settings record', () => {
  saveJsonSetting('device_id', 'device-test', '2026-03-06T00:00:00.000Z');
  saveJsonSetting(
    'app_settings',
    { [FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]: 'cjk-trigram' },
    '2026-03-06T00:01:00.000Z'
  );

  const connection = openDatabaseConnection();
  const settingRecord = connection.sqlite
    .prepare(
      `SELECT scope, platform, form_factor, device_id, value_json
       FROM setting_records
       WHERE key = ?`
    )
    .get('app_settings') as Record<string, unknown>;
  const syncState = connection.sqlite
    .prepare(
      `SELECT object_id, object_type, sync_dirty
       FROM sync_object_state
       WHERE object_type = 'setting' AND object_id = ?`
    )
    .get('user_space:windows:desktop:*:app_settings') as Record<string, unknown>;
  const parsedValue = JSON.parse(String(settingRecord.value_json)) as Record<string, unknown>;

  expect(settingRecord).toMatchObject({
    device_id: '*',
    form_factor: 'desktop',
    platform: 'windows',
    scope: 'user_space'
  });
  expect(parsedValue[FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]).toBe('cjk-trigram');
  expect(syncState).toMatchObject({
    object_id: 'user_space:windows:desktop:*:app_settings',
    object_type: 'setting',
    sync_dirty: 1
  });
});
