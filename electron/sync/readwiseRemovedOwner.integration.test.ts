import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: root, app_config_dir: path.join(root, 'config'),
  app_cache_dir: path.join(root, 'cache'), app_log_dir: path.join(root, 'logs')
}) }));

import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import { loadReadwiseOwnerGuard } from '../database/readwiseOwnerGuard.js';
import { saveJsonSetting } from '../database/settingsStore.js';
import { initiateDesktopSyncGroupDeviceRemoval } from '../database/syncGroupMemberStateStore.js';
import { createDesktopSyncGroup, registerSyncGroupDevice } from '../database/syncGroupStore.js';

import { activateReadwiseWithHandoff } from './readwiseOwnerHandoff.js';

function identity(anchor: string, libraryPath: string) {
  return createSyncGroupDeviceIdentity({ device_anchor: anchor, group_id: 'group',
    library_path: libraryPath, path_flavor: 'posix' });
}
const oldOwner = identity('11111111-1111-4111-8111-111111111111', '/old');
const candidate = identity('22222222-2222-4222-8222-222222222222', '/new');
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-removed-owner-'));
  initializeDatabase();
  createDesktopSyncGroup({ device: candidate, deviceName: 'Candidate', platform: 'darwin' });
  registerSyncGroupDevice({ device: oldOwner, deviceName: 'Old owner', platform: 'darwin' });
  saveJsonSetting('readwise_source_mode', { mode: 'relay', version: 1 });
  saveJsonSetting('readwise_active_host', { device_identity_key: oldOwner.identity_key,
    host_name: 'Old owner', epoch: 4 });
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it('keeps an offline active owner assigned without a stop acknowledgement', async () => {
  await expect(activateReadwiseWithHandoff()).resolves.toMatchObject({ is_active: false,
    active_device_identity_key: oldOwner.identity_key, active_owner_epoch: 4 });
  expect(loadReadwiseOwnerGuard('group')).toBeNull();
});

it('does not treat an unknown owner as a removed member', async () => {
  openDatabaseConnection().driver.execute('DELETE FROM sync_group_devices WHERE device_identity_key = ?',
    [oldOwner.identity_key]);
  await expect(activateReadwiseWithHandoff()).resolves.toMatchObject({ is_active: false,
    active_device_identity_key: oldOwner.identity_key, active_owner_epoch: 4 });
  expect(loadReadwiseOwnerGuard('group')).toBeNull();
});

it('takes over only after durable member removal and keeps the new epoch after reopening', async () => {
  initiateDesktopSyncGroupDeviceRemoval(oldOwner.identity_key);
  expect(openDatabaseConnection().driver.queryOne('SELECT state FROM sync_group_devices WHERE device_identity_key = ?',
    [oldOwner.identity_key])).toEqual({ state: 'left' });
  await expect(activateReadwiseWithHandoff()).resolves.toMatchObject({ is_active: true,
    active_device_identity_key: candidate.identity_key, active_owner_epoch: 5 });
  expect(loadReadwiseOwnerGuard('group')).toMatchObject({ state: 'active', epoch: 5, ownerId: candidate.identity_key });
  closeDatabaseConnection();
  expect(loadReadwiseHostAssignment()).toMatchObject({ is_active: true, active_owner_epoch: 5 });
  await activateReadwiseWithHandoff();
  expect(loadReadwiseHostAssignment().active_owner_epoch).toBe(5);
});
