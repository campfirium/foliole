import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
let dataRoot = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_data_dir: dataRoot, app_config_dir: path.join(dataRoot, 'config'),
    app_cache_dir: path.join(dataRoot, 'cache'), app_log_dir: path.join(dataRoot, 'logs') })
}));

import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';

import { createApplicationDatabaseBackup, restoreApplicationDatabaseBackup } from './backupRestore.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { isDesktopSourceConnected, loadCurrentDesktopHost, loadCurrentHostDesktopSources,
  loadDesktopSource, upsertDesktopSource } from './desktopSources.js';
import { loadDesktopDeviceId } from './deviceIdentity.js';
import { initializeDatabase } from './migrate.js';
import { loadReadwiseHostAssignment } from './readwiseHostAssignment.js';
import { migrateReadwiseSourceIdentity } from './readwiseSourceIdentity.js';
import { saveJsonSetting } from './settingsStore.js';
import { createDesktopSyncGroup, leaveDesktopSyncGroupDevice } from './syncGroupStore.js';

beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-standalone-')); });
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

function openLibrary(name: string) {
  closeDatabaseConnection();
  dataRoot = path.join(root, name);
  initializeDatabase();
  return { id: loadDesktopDeviceId(), name: loadCurrentDesktopHost().name };
}

it('does not execute a copied relay source belonging to another same-name standalone library', async () => {
  const first = openLibrary('first');
  const folder = path.join(root, 'readwise');
  await fs.mkdir(folder);
  const source = upsertDesktopSource({ configRef: 'articles', rootPath: folder, sourceType: 'readwise',
    typeSettings: { kind: 'articles', keepState: 'enabled' }, updatedAt: '2026-10-19T00:00:00Z' });
  expect(isDesktopSourceConnected(source)).toBe(true);
  const second = openLibrary('second');
  expect(second.name).toBe(first.name);
  expect(second.id).not.toBe(first.id);
  openDatabaseConnection().driver.execute(`INSERT INTO desktop_sources
    (source_ref, source_type, config_ref, host_name, host_platform, root_path, path_flavor,
      type_settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [source.source_ref, source.source_type, source.config_ref, source.host_name, source.host_platform,
    source.root_path, source.path_flavor, source.type_settings_json, source.updated_at, source.updated_at]);
  expect(loadCurrentHostDesktopSources('readwise')).toEqual([]);
  expect(isDesktopSourceConnected(source)).toBe(false);
  closeDatabaseConnection();
  initializeDatabase();
  expect(isDesktopSourceConnected(loadDesktopSource(source.source_ref)!)).toBe(false);
  openLibrary('first');
  expect(isDesktopSourceConnected(loadDesktopSource(source.source_ref)!)).toBe(true);
});

it('uses the standalone owner UUID even when its display name differs', () => {
  const local = openLibrary('local');
  saveJsonSetting('readwise_active_host', {
    device_identity_key: local.id, host_name: 'Previous display name', epoch: 0
  });
  expect(loadReadwiseHostAssignment().is_active).toBe(true);
  closeDatabaseConnection();
  initializeDatabase();
  expect(loadReadwiseHostAssignment().is_active).toBe(true);
});

it('rejects another standalone owner despite an identical display name', () => {
  const first = openLibrary('first');
  const second = openLibrary('second');
  expect(second.name).toBe(first.name);
  saveJsonSetting('readwise_active_host', {
    device_identity_key: first.id, host_name: first.name, epoch: 0
  });
  expect(loadReadwiseHostAssignment().is_active).toBe(false);
});

it('keeps local relay ownership through join, leave and restore without retagging foreign sources', async () => {
  openLibrary('transitions');
  const folder = path.join(root, 'relay');
  await fs.mkdir(folder);
  const source = upsertDesktopSource({ configRef: 'local', rootPath: folder, sourceType: 'readwise', updatedAt: 'now' });
  const foreign = upsertDesktopSource({ configRef: 'foreign', rootPath: folder, sourceType: 'readwise',
    ownerDeviceIdentityKey: 'foreign-device', updatedAt: 'now' });
  const device = createSyncGroupDeviceIdentity({ device_anchor: '11111111-1111-4111-8111-111111111111',
    group_id: 'test-group', library_path: openDatabaseConnection().dbPath, path_flavor: 'posix' });
  createDesktopSyncGroup({ device, deviceName: 'Renamed member', platform: 'darwin' });
  saveJsonSetting('readwise_active_host', { device_identity_key: device.identity_key, host_name: 'Member', epoch: 0 });
  expect(isDesktopSourceConnected(loadDesktopSource(source.source_ref)!)).toBe(true);
  expect(isDesktopSourceConnected(loadDesktopSource(foreign.source_ref)!)).toBe(false);
  leaveDesktopSyncGroupDevice(device.identity_key);
  expect(loadReadwiseHostAssignment().is_active).toBe(true);
  expect(isDesktopSourceConnected(loadDesktopSource(source.source_ref)!)).toBe(true);
  const backup = await createApplicationDatabaseBackup({ destinationPath: path.join(root, 'backup.db') });
  openDatabaseConnection().driver.execute("UPDATE settings SET value = ? WHERE key = 'standalone_device_uuid'",
    ['"22222222-2222-4222-8222-222222222222"']);
  await restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath });
  expect(loadReadwiseHostAssignment().is_active).toBe(true);
  expect(isDesktopSourceConnected(loadDesktopSource(source.source_ref)!)).toBe(true);
  expect(isDesktopSourceConnected(loadDesktopSource(foreign.source_ref)!)).toBe(false);
  closeDatabaseConnection();
  initializeDatabase();
  expect(isDesktopSourceConnected(loadDesktopSource(source.source_ref)!)).toBe(true);
});

it('migrates legacy local source ownership once and never reclaims a foreign source by name', () => {
  const local = openLibrary('legacy');
  const driver = openDatabaseConnection().driver;
  const source = upsertDesktopSource({ configRef: 'legacy', rootPath: root, sourceType: 'readwise', updatedAt: 'old' });
  driver.execute(`UPDATE desktop_sources SET type_settings_json = '{}' WHERE source_ref = ?`, [source.source_ref]);
  driver.execute("DELETE FROM settings WHERE key = 'readwise_source_identity_initialized'");
  saveJsonSetting('readwise_active_host', { host_name: local.name });
  migrateReadwiseSourceIdentity(driver, local.name, 'migration');
  expect(loadReadwiseHostAssignment().is_active).toBe(true);
  expect(isDesktopSourceConnected(loadDesktopSource(source.source_ref)!)).toBe(true);
  driver.execute(`UPDATE desktop_sources SET type_settings_json = json_set(type_settings_json,
    '$.ownerDeviceIdentityKey', 'foreign-device') WHERE source_ref = ?`, [source.source_ref]);
  closeDatabaseConnection();
  initializeDatabase();
  expect(isDesktopSourceConnected(loadDesktopSource(source.source_ref)!)).toBe(false);
});
