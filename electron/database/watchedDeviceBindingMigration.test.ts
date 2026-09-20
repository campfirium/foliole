// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_data_dir: appDataDir, app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'), app_log_dir: path.join(appDataDir, 'logs') })
}));

import { migrateWatchedDeviceBindings } from '../../lib/core/database/numberedMigrationWatchedDeviceBindings.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';

let root = '';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-watched-binding-migration-'));
  appDataDir = path.join(root, 'app-data');
  initializeDatabase();
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it('keeps historical paths while publishing only stable, paused source facts', () => {
  const { driver, sqlite } = openDatabaseConnection();
  driver.execute(`INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
    VALUES ('group', 'Group', 'key', 'now', 'now')`);
  driver.execute(`INSERT INTO sync_group_local_state
    (singleton_id, group_id, local_device_identity_key, state, updated_at)
    VALUES (1, 'group', 'local-device', 'active', 'now')`);
  for (const [id, name] of [['local-device', 'This Mac'], ['remote-device', 'Other Mac']] as const) {
    driver.execute(`INSERT INTO sync_group_devices
      (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
       platform, state, joined_at, left_at, last_seen_at, updated_at)
      VALUES ('group', ?, ?, ?, ?, 'macOS', 'active', 'now', NULL, 'now', 'now')`,
    [id, `${id}-anchor`, `/library/${id}`, name]);
  }
  for (const [ref, host, folder] of [
    ['watched:local', 'This Mac', '/local/private'],
    ['watched:remote', 'Other Mac', '/remote/private'],
    ['watched:unbound', 'This Mac', '/unbound/private']
  ] as const) {
    driver.execute(`INSERT INTO desktop_sources
      (source_ref, source_type, config_ref, host_name, host_platform, root_path,
       path_flavor, type_settings_json, created_at, updated_at)
      VALUES (?, 'watched', ?, ?, 'macOS', ?, 'posix', ?, 'now', 'now')`,
    [ref, ref.slice(8), host, folder, JSON.stringify({ highlightPath: `${folder}/highlights` })]);
    if (ref !== 'watched:unbound') driver.execute(`INSERT INTO watched_folder_bindings
      (binding_id, connection_status, action_mode, highlight_mode, primary_path,
       created_at, updated_at, source_ref)
      VALUES (?, 'connected', 'keep', 'merged', ?, 'now', 'now', ?)`,
    [ref.slice(8), folder, ref]);
  }
  saveJsonSetting('import_manager_settings', { sources: [
    { id: 'local', primaryPath: '/local/private', highlightPath: '/local/private/highlights',
      archivePath: '/local/private/archive' }
  ] }, 'now');
  sqlite.exec('ALTER TABLE watched_folder_bindings DROP COLUMN owner_device_identity_key');
  sqlite.transaction(() => migrateWatchedDeviceBindings(sqlite))();
  expect(driver.queryAll(`SELECT binding_id, owner_device_identity_key, connection_status
    FROM watched_folder_bindings ORDER BY binding_id`)).toEqual([
    { binding_id: 'local', owner_device_identity_key: 'local-device', connection_status: 'needs-folder' },
    { binding_id: 'remote', owner_device_identity_key: 'remote-device', connection_status: 'needs-folder' },
    { binding_id: 'unbound', owner_device_identity_key: 'local-device', connection_status: 'needs-folder' }
  ]);
  expect(driver.queryOne<{ root_path: string }>(
    "SELECT root_path FROM desktop_sources WHERE source_ref = 'watched:local'"
  )?.root_path).toBe('/local/private');
  expect(JSON.stringify(loadJsonSetting('import_manager_settings'))).not.toContain('/local/private');
  const payload = driver.queryOne<{ payload_json: string }>(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.watched_folder,
    ['local'])!.payload_json;
  expect(payload).not.toContain('/local/private');
  expect(JSON.parse(payload)).toMatchObject({ owner_device_identity_key: 'local-device' });
  expect(driver.queryOne(`SELECT sync_dirty FROM sync_object_state
    WHERE object_type = 'watched_folder' AND object_id = 'unbound'`)).toEqual({ sync_dirty: 1 });
});

it('scrubs a shared settings record even if its local settings row is absent', () => {
  const { driver, sqlite } = openDatabaseConnection();
  driver.execute(`INSERT INTO desktop_sources
    (source_ref, source_type, config_ref, host_name, host_platform, root_path,
     path_flavor, type_settings_json, created_at, updated_at)
    VALUES ('watched:old', 'watched', 'old', 'Local Mac', 'macOS', '/local/private',
      'posix', '{}', 'now', 'now')`);
  driver.execute(`INSERT INTO import_sources
    (source_fingerprint, provider, source_kind, source_name, source_locator,
     first_imported_at, last_imported_at, last_content_fingerprint, source_ref)
    VALUES ('watched-file', 'markdown', 'file', 'note.md', '/local/private/note.md',
      'now', 'now', 'content', 'watched:old')`);
  saveJsonSetting('import_manager_settings', { sources: [
    { id: 'orphan', primaryPath: '/private/orphan' }
  ] }, 'now');
  driver.execute("DELETE FROM settings WHERE key = 'import_manager_settings'");
  sqlite.exec('ALTER TABLE watched_folder_bindings DROP COLUMN owner_device_identity_key');
  sqlite.transaction(() => migrateWatchedDeviceBindings(sqlite))();
  const record = driver.queryOne<{ value_json: string }>(`SELECT value_json FROM setting_records
    WHERE key = 'import_manager_settings'`);
  expect(record?.value_json).not.toContain('/private/orphan');
  const payload = driver.queryOne<{ payload_json: string }>(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.import_source,
    ['watched-file'])!.payload_json;
  expect(payload).not.toContain('/local/private');
  expect(driver.queryOne(`SELECT sync_dirty FROM sync_object_state
    WHERE object_type = 'import_source' AND object_id = 'watched-file'`)).toEqual({ sync_dirty: 1 });
});
