// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-setting-single-truth-migration-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { migrateHostPermanentState } from '../../lib/core/database/numberedMigrationHostPermanentState.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { migrateNumberedFixtureTo } from './numberedMigrationTestSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-setting-migration-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  openDatabaseConnection().sqlite.exec(
    'ALTER TABLE setting_records RENAME COLUMN host_name TO device_id;' +
    'ALTER TABLE sync_object_state RENAME COLUMN last_modified_by_host_name TO last_modified_by_device_id;' +
    "DELETE FROM settings WHERE key = 'host_name'"
  );
  writeProjection('device_id', '"desktop-device"', '2026-07-10T00:00:00.000Z');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function writeProjection(key: string, value: string, updatedAt: string) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, updatedAt]
  );
}

function writeRecord(args: {
  deviceId?: string;
  key: string;
  scope?: string;
  updatedAt: string;
  value: string;
}) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO setting_records (
       key, scope, platform, form_factor, device_id, value_json, content_hash, updated_at
     ) VALUES (?, ?, 'windows', 'desktop', ?, ?, 'legacy-hash', ?)`,
    [args.key, args.scope ?? 'user_space', args.deviceId ?? '*', args.value, args.updatedAt]
  );
}

function settingRecord(key: string, scope = 'user_space', hostName = '*') {
  const connection = openDatabaseConnection();
  const columns = connection.sqlite.prepare("SELECT name FROM pragma_table_info('setting_records')")
    .pluck().all() as string[];
  const hostColumn = columns.includes('host_name') ? 'host_name' : 'device_id';
  return connection.driver.queryOne<{
    content_hash: string;
    updated_at: string;
    value_json: string;
  }>(
    `SELECT value_json, content_hash, updated_at FROM setting_records
     WHERE key = ? AND scope = ? AND platform = 'windows' AND form_factor = 'desktop' AND ${hostColumn} = ?`,
    [key, scope, hostName]
  );
}

function projection(key: string) {
  return openDatabaseConnection().driver.queryOne<{ updated_at: string; value: string }>(
    'SELECT value, updated_at FROM settings WHERE key = ?',
    [key]
  );
}

function migrateFromV53() {
  const connection = openDatabaseConnection();
  connection.sqlite.pragma('user_version = 53');
  migrateNumberedFixtureTo(connection.sqlite, 54);
}

it('reconciles missing, newer, equal-timestamp, and local-only settings deterministically', () => {
  writeProjection('app_settings', '{"source":"old-projection"}', '2026-07-10T00:01:00.000Z');
  writeRecord({ key: 'app_settings', updatedAt: '2026-07-10T00:02:00.000Z', value: '{"source":"record"}' });
  writeProjection('backup_settings', '{"source":"projection"}', '2026-07-10T00:03:00.000Z');
  writeRecord({ key: 'backup_settings', updatedAt: '2026-07-10T00:02:00.000Z', value: '{"source":"old-record"}' });
  writeProjection('import_manager_settings', '{"source":"projection-only"}', '2026-07-10T00:04:00.000Z');
  writeRecord({ key: 'library_path_settings', updatedAt: '2026-07-10T00:05:00.000Z', value: '{"source":"record-only"}' });
  writeProjection('review_scheduler_settings', '{"source":"projection-tie"}', '2026-07-10T00:06:00.000Z');
  writeRecord({ key: 'review_scheduler_settings', updatedAt: '2026-07-10T00:06:00.000Z', value: '{"source":"record-tie"}' });
  writeProjection('watch_import_cursor_state', '{"cursor":"local"}', '2026-07-10T00:07:00.000Z');
  writeProjection('desktop_node_sync_version_counter', '12', '2026-07-10T00:08:00.000Z');

  migrateFromV53();

  expect(projection('app_settings')?.value).toBe('{"source":"record"}');
  expect(settingRecord('backup_settings')?.value_json).toBe('{"source":"projection"}');
  expect(settingRecord('import_manager_settings')?.value_json).toBe('{"source":"projection-only"}');
  expect(projection('library_path_settings')?.value).toBe('{"source":"record-only"}');
  expect(projection('review_scheduler_settings')?.value).toBe('{"source":"record-tie"}');
  expect(settingRecord('watch_import_cursor_state')).toBeUndefined();
  expect(settingRecord('desktop_node_sync_version_counter')).toBeUndefined();
  expect(openDatabaseConnection().sqlite.pragma('user_version', { simple: true })).toBe(54);
  expect(openDatabaseConnection().driver.queryOne<{ sync_dirty: number }>(
    `SELECT sync_dirty FROM sync_object_state
     WHERE object_type = 'setting' AND object_id = 'user_space:windows:desktop:*:backup_settings'`
  )).toEqual({ sync_dirty: 1 });
});

it('applies local tombstones without materializing foreign device records', () => {
  writeProjection('discourse_publish_settings', '{"enabled":true}', '2026-07-10T00:01:00.000Z');
  writeProjection('window_state', '{"width":900}', '2026-07-10T00:02:00.000Z');
  writeRecord({
    deviceId: 'foreign-device',
    key: 'window_state',
    scope: 'session_resume',
    updatedAt: '2026-07-10T00:03:00.000Z',
    value: '{"width":1200}'
  });
  openDatabaseConnection().driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, deleted_at, sync_dirty
     ) VALUES ('setting', ?, 1, 'delete-hash', 'remote', ?, ?, 0)`,
    [
      'device:windows:desktop:desktop-device:discourse_publish_settings',
      '2026-07-10T00:04:00.000Z',
      '2026-07-10T00:04:00.000Z'
    ]
  );

  migrateFromV53();
  migrateHostPermanentState(openDatabaseConnection().sqlite);

  expect(projection('discourse_publish_settings')).toBeUndefined();
  expect(projection('window_state')?.value).toBe('{"width":900}');
  expect(settingRecord('window_state', 'session_resume', 'foreign-device')).toBeUndefined();
  expect(settingRecord('window_state', 'session_resume', 'desktop-device')?.value_json).toBe('{"width":900}');
});

it('rolls back DML and user_version when migration fails', () => {
  writeProjection('app_settings', '{"theme":"dark"}', '2026-07-10T00:01:00.000Z');
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`CREATE TRIGGER fail_setting_migration
    BEFORE INSERT ON setting_records WHEN NEW.key = 'app_settings'
    BEGIN SELECT RAISE(ABORT, 'migration failed'); END`);
  connection.sqlite.pragma('user_version = 53');

  expect(() => migrateNumberedFixtureTo(connection.sqlite, 54)).toThrow(/migration failed/i);

  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(53);
  expect(settingRecord('app_settings')).toBeUndefined();
  expect(projection('app_settings')?.value).toBe('{"theme":"dark"}');
});
