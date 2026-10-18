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

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
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
