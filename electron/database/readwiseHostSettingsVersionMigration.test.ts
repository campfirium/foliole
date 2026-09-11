// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';

const GUARDS = [
  'readwise_host_settings_insert_guard',
  'readwise_host_settings_update_guard',
  'readwise_host_setting_record_insert_guard',
  'readwise_host_setting_record_update_guard'
];
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-settings-v2-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function prepareV78(value: string) {
  const connection = openDatabaseConnection();
  for (const guard of GUARDS) connection.sqlite.exec(`DROP TRIGGER ${guard}`);
  connection.sqlite.pragma('user_version = 78');
  connection.driver.execute(`INSERT INTO settings (key, value, updated_at)
    VALUES ('readwise_import_settings', ?, 'old')`, [value]);
  connection.driver.execute(`INSERT INTO setting_records
    (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at)
    VALUES ('readwise_import_settings', 'host', 'windows', 'desktop', 'This Mac', ?, 'old-hash', 'old')`, [value]);
  connection.driver.execute(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, current_version_id, content_hash,
      last_modified_by_host_name, updated_at, deleted_at, sync_dirty)
    VALUES ('setting', 'host:windows:desktop:Other:other', 7, NULL, 'other-hash', 'Other', 'old', NULL, 0)`);
  return connection;
}

it('migrates legacy Host settings to explicit folder mode and blocks v1 writes', () => {
  const legacy = JSON.stringify({ readwiseRootPath: '/Readwise', version: 1 });
  const connection = prepareV78(legacy);
  initializeDatabaseSchema(connection.sqlite);

  const projection = JSON.parse(connection.driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'readwise_import_settings'"
  )!.value) as Record<string, unknown>;
  const canonical = JSON.parse(connection.driver.queryOne<{ value_json: string }>(
    "SELECT value_json FROM setting_records WHERE key = 'readwise_import_settings'"
  )!.value_json) as Record<string, unknown>;
  expect(projection).toMatchObject({
    autoImportPolicyVersion: 3,
    apiConnection: { secretRef: null, state: 'disconnected', verifiedAt: null },
    readwiseRootPath: '/Readwise', readwiseSourceMode: 'folder', version: 5
  });
  expect(canonical).toEqual(projection);
  expect(connection.driver.queryOne<{ state_seq: number; sync_dirty: number }>(
    "SELECT state_seq, sync_dirty FROM sync_object_state WHERE object_type = 'setting' AND object_id LIKE '%readwise_import_settings'"
  )).toMatchObject({ state_seq: 11, sync_dirty: 1 });
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(86);
  expect(() => connection.driver.execute(
    "UPDATE settings SET value = '{\"version\":1}' WHERE key = 'readwise_import_settings'"
  )).toThrow('readwise_host_settings_version_unsupported');
});

it('rolls back settings and schema version when the cutover transaction fails', () => {
  const legacy = JSON.stringify({ readwiseRootPath: '/Readwise', version: 1 });
  const connection = prepareV78(legacy);

  expect(() => initializeDatabaseSchema(connection.sqlite, {
    beforeVersionCommit: () => { throw new Error('injected migration failure'); }
  })).toThrow('injected migration failure');

  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(78);
  expect(connection.driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'readwise_import_settings'"
  )?.value).toBe(legacy);
  expect(connection.driver.queryAll<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'readwise_host_setting%'"
  )).toEqual([]);
});
