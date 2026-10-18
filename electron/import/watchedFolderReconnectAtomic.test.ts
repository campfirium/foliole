// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appData = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appData, app_cache_dir: path.join(appData, 'cache'),
  app_config_dir: path.join(appData, 'config'), app_log_dir: path.join(appData, 'logs')
}) }));

import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { initiateDesktopSyncGroupDeviceRemoval } from '../database/syncGroupMemberStateStore.js';
import { createDesktopSyncGroup, registerSyncGroupDevice } from '../database/syncGroupStore.js';
import { disconnectWatchedFolderBinding, upsertChangedWatchedFolderSource } from '../database/watchedFolderBindings.js';

import { loadImportManagerSettings, saveImportManagerSettings } from './importManagerSettings.js';
import { confirmWatchedFolderReconnect } from './watchedFolderReconnect.js';

let root = '';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-reconnect-atomic-'));
  appData = path.join(root, 'app');
  initializeDatabase();
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

async function fixture() {
  const oldPath = path.join(root, 'old');
  const newPath = path.join(root, 'new');
  await fs.mkdir(oldPath);
  await fs.mkdir(newPath);
  const source = { id: 'rule', actionMode: 'keep' as const, archivePath: '',
    highlightMode: 'merged' as const, highlightPath: '', primaryPath: oldPath,
    keepPreview: null, keepState: 'enabled' as const };
  saveImportManagerSettings({ ...loadImportManagerSettings(), sources: [source] });
  const binding = upsertChangedWatchedFolderSource(source, '2026-10-18T00:00:00.000Z')!;
  return { binding, newPath };
}

function persistedState() {
  const driver = openDatabaseConnection().driver;
  return {
    settings: driver.queryAll('SELECT * FROM settings ORDER BY key'),
    bindings: driver.queryAll('SELECT * FROM watched_folder_bindings ORDER BY binding_id'),
    sources: driver.queryAll('SELECT * FROM desktop_sources ORDER BY source_ref'),
    imports: driver.queryAll('SELECT * FROM import_sources ORDER BY source_fingerprint'),
    nodes: driver.queryAll('SELECT * FROM nodes ORDER BY id'),
    sync: driver.queryAll('SELECT * FROM sync_object_state ORDER BY object_type, object_id')
  };
}

it('does not change settings when the connected remote owner rejects a reconnect', async () => {
  const { binding, newPath } = await fixture();
  openDatabaseConnection().driver.execute(
    'UPDATE watched_folder_bindings SET owner_device_identity_key = ? WHERE binding_id = ?',
    ['other-device', binding.binding_id]);
  const before = persistedState();
  await expect(confirmWatchedFolderReconnect({ bindingId: binding.binding_id, folderPath: newPath }))
    .rejects.toThrow('watched_folder_owner_must_disconnect');
  expect(persistedState()).toEqual(before);
  closeDatabaseConnection();
  expect(persistedState()).toEqual(before);
});

it('rolls back a local reconnect if saving its settings fails', async () => {
  const { binding, newPath } = await fixture();
  disconnectWatchedFolderBinding(binding.binding_id);
  const before = persistedState();
  openDatabaseConnection().driver.execute(`CREATE TRIGGER reject_reconnect_settings
    BEFORE UPDATE ON settings WHEN NEW.key = 'import_manager_settings'
    BEGIN SELECT RAISE(ABORT, 'settings_write_failed'); END`);
  await expect(confirmWatchedFolderReconnect({ bindingId: binding.binding_id, folderPath: newPath }))
    .rejects.toThrow('settings_write_failed');
  expect(persistedState()).toEqual(before);
});

it('does not recreate a source removed while its candidate folder is being scanned', async () => {
  const { binding, newPath } = await fixture();
  disconnectWatchedFolderBinding(binding.binding_id);
  const pending = confirmWatchedFolderReconnect({ bindingId: binding.binding_id, folderPath: newPath });
  openDatabaseConnection().driver.execute('DELETE FROM watched_folder_bindings WHERE binding_id = ?',
    [binding.binding_id]);
  const before = persistedState();
  await expect(pending).rejects.toThrow('watched_folder_not_found');
  expect(persistedState()).toEqual(before);
});

it('preserves a connected source and its imported content when its owner leaves the group', async () => {
  const identity = (anchor: string, libraryPath: string) => createSyncGroupDeviceIdentity({
    device_anchor: anchor, group_id: 'watched-removal', library_path: libraryPath, path_flavor: 'posix'
  });
  const local = identity('11111111-1111-4111-8111-111111111111', '/local');
  const old = identity('22222222-2222-4222-8222-222222222222', '/old');
  createDesktopSyncGroup({ device: local, deviceName: 'Local', platform: 'darwin' });
  registerSyncGroupDevice({ device: old, deviceName: 'Old', platform: 'darwin' });
  const { binding, newPath } = await fixture();
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES ('imported-note', 'topic', 'Imported note', 'Preserved content', 'now', 'now')`);
  driver.execute(`INSERT INTO import_sources (
    source_fingerprint, provider, source_kind, source_name, source_locator, first_imported_at,
    last_imported_at, last_content_fingerprint, latest_node_id, watched_binding_id, watched_relative_path
  ) VALUES ('imported-file', 'markdown', 'file', 'note.md', 'note.md', 'now', 'now', 'hash',
    'imported-note', ?, 'note.md')`, [binding.binding_id]);
  driver.execute(
    'UPDATE watched_folder_bindings SET owner_device_identity_key = ? WHERE binding_id = ?',
    [old.identity_key, binding.binding_id]);
  const before = persistedState();
  initiateDesktopSyncGroupDeviceRemoval(old.identity_key);
  expect(driver.queryOne('SELECT state FROM sync_group_devices WHERE device_identity_key = ?',
    [old.identity_key])).toEqual({ state: 'left' });
  expect(persistedState()).toEqual(before);
  await expect(confirmWatchedFolderReconnect({ bindingId: binding.binding_id, folderPath: newPath }))
    .rejects.toThrow('watched_folder_owner_must_disconnect');
  expect(persistedState()).toEqual(before);
  closeDatabaseConnection();
  expect(persistedState()).toEqual(before);
});
