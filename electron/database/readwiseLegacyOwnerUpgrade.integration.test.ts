// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: path.join(root, 'data'), app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs')
}) }));

import { createSyncGroupDeviceIdentity, devicePathFlavorFromCanonicalLibraryPath } from '../../lib/platform/syncGroupUnifiedContract.js';

import { createApplicationDatabaseBackup, restoreApplicationDatabaseBackup } from './backupRestore.js';
import { inspectBackupRestoreSync } from './backupRestoreSyncPreview.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { loadReadwiseHostAssignment } from './readwiseHostAssignment.js';
import { loadReadwiseOwnerGuard, saveReadwiseOwnerGuard } from './readwiseOwnerGuard.js';
import { saveJsonSetting } from './settingsStore.js';
import { createDesktopSyncGroup, leaveDesktopSyncGroupDevice, loadDesktopSyncGroup,
  registerSyncGroupDevice } from './syncGroupStore.js';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-legacy-owner-'));
  vi.stubEnv('FOLIOLE_ELECTRON_TEST_STATE_ROOT', root);
  initializeDatabase();
  saveJsonSetting('readwise_source_mode', { mode: 'relay', version: 1 });
});
afterEach(async () => {
  closeDatabaseConnection();
  vi.unstubAllEnvs();
  await fs.rm(root, { recursive: true, force: true });
});

function joinGroup(withRemote: boolean) {
  const device = createSyncGroupDeviceIdentity({ device_anchor: '11111111-1111-4111-8111-111111111111',
    group_id: 'legacy', library_path: openDatabaseConnection().dbPath,
    path_flavor: devicePathFlavorFromCanonicalLibraryPath(openDatabaseConnection().dbPath) });
  createDesktopSyncGroup({ device, deviceName: 'This Mac', platform: 'darwin' });
  if (!withRemote) return device.identity_key;
  const remote = createSyncGroupDeviceIdentity({ device_anchor: '22222222-2222-4222-8222-222222222222',
    group_id: 'legacy', library_path: 'D:\\Library\\foliole.db', path_flavor: 'windows' });
  registerSyncGroupDevice({ device: remote, deviceName: 'Other desktop', platform: 'win32' });
  return device.identity_key;
}

function expectStandaloneOwner() {
  expect(loadReadwiseHostAssignment()).toMatchObject({ is_active: true, legacy_unassigned: true,
    active_host_name: null, activation_blocked_reason: null });
}

it('runs a standalone library whose legacy owner names a former group member', async () => {
  const localId = joinGroup(true);
  saveJsonSetting('readwise_active_host', { host_name: 'Other desktop' });
  leaveDesktopSyncGroupDevice(localId);
  expect(loadDesktopSyncGroup()).toBeNull();
  expectStandaloneOwner();
  closeDatabaseConnection();
  initializeDatabase();
  expectStandaloneOwner();
});

it('keeps this device responsible after restoring its own name-only backup', async () => {
  joinGroup(false);
  saveJsonSetting('readwise_active_host', { host_name: 'This Mac' });
  const backup = await createApplicationDatabaseBackup();
  const group = loadDesktopSyncGroup()!;
  saveReadwiseOwnerGuard({ epoch: 7, groupId: group.group_id, mode: 'relay',
    ownerId: group.local_device_identity_key, state: 'active', targetId: null });
  saveJsonSetting('readwise_active_host', { device_identity_key: group.local_device_identity_key,
    host_name: 'This Mac', epoch: 7, selection_source: 'chosen' });
  expect(loadReadwiseHostAssignment().is_active).toBe(true);
  const preview = await inspectBackupRestoreSync(backup.destinationPath);
  await restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath,
    choice: { source: 'current', action: 'pause', revision: preview.revision } });
  const expected = { is_active: true, active_device_identity_key: group.local_device_identity_key,
    active_owner_epoch: 8 };
  expect(loadReadwiseHostAssignment()).toMatchObject(expected);
  expect(loadReadwiseOwnerGuard(group.group_id)).toMatchObject({ epoch: 8, state: 'active' });
  closeDatabaseConnection();
  initializeDatabase();
  expect(loadReadwiseHostAssignment()).toMatchObject(expected);
});
