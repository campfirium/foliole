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

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { updateLocalDesktopSourceHosts } from './desktopSources.js';
import { initializeDatabase } from './migrate.js';
import {
  loadWatchedFolderBindings,
  resolveExecutableWatchedBinding,
  upsertChangedWatchedFolderSource
} from './watchedFolderBindings.js';

let root = '';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-watched-device-identity-'));
  appDataDir = path.join(root, 'app-data');
  initializeDatabase();
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it('shows a same-named remote path without treating it as locally executable', async () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
    VALUES ('group', 'Group', 'key', 'now', 'now')`);
  driver.execute(`INSERT INTO sync_group_local_state
    (singleton_id, group_id, local_device_identity_key, state, updated_at)
    VALUES (1, 'group', 'local-device', 'active', 'now')`);
  for (const id of ['local-device', 'remote-device']) {
    driver.execute(`INSERT INTO sync_group_devices
      (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
       platform, state, joined_at, left_at, last_seen_at, updated_at)
      VALUES ('group', ?, ?, ?, 'Shared Name', 'macOS', 'active', 'now', NULL, 'now', 'now')`,
    [id, `${id}-anchor`, `/library/${id}`]);
  }
  const folder = path.join(root, 'local-folder');
  await fs.mkdir(folder);
  const local = upsertChangedWatchedFolderSource({
    actionMode: 'keep', archivePath: '', highlightMode: 'merged', highlightPath: '',
    id: 'local', keepPreview: null, keepState: 'enabled', primaryPath: folder
  }, 'now')!;
  driver.execute(`INSERT INTO desktop_sources
    (source_ref, source_type, config_ref, host_name, host_platform, root_path,
     path_flavor, type_settings_json, created_at, updated_at)
    VALUES ('watched:remote', 'watched', 'remote', 'Shared Name', 'macOS',
      '/remote/private', 'posix', '{}', 'now', 'now')`);
  driver.execute(`INSERT INTO watched_folder_bindings
    (binding_id, connection_status, action_mode, highlight_mode, primary_path, reported_path,
     created_at, updated_at, source_ref, owner_device_identity_key)
    VALUES ('remote', 'connected', 'keep', 'merged', '/remote/private', '/remote/private',
      'now', 'now', 'watched:remote', 'remote-device')`);
  expect(resolveExecutableWatchedBinding('local', folder).executable).toBe(true);
  expect(resolveExecutableWatchedBinding('remote', '/remote/private').executable).toBe(false);
  expect(loadWatchedFolderBindings().find((item) => item.binding_id === 'remote')).toMatchObject({
    primary_path: '/remote/private', connection_status: 'needs-folder'
  });
  updateLocalDesktopSourceHosts({ currentHostName: 'Renamed Mac', currentHostPlatform: 'darwin',
    driver, previousHostName: 'Shared Name', updatedAt: 'later' });
  expect(driver.queryOne<{ host_name: string }>(
    'SELECT host_name FROM desktop_sources WHERE source_ref = ?', [local.source_ref]
  )?.host_name).toBe('Renamed Mac');
  expect(driver.queryOne<{ host_name: string }>(
    "SELECT host_name FROM desktop_sources WHERE source_ref = 'watched:remote'"
  )?.host_name).toBe('Shared Name');
});
