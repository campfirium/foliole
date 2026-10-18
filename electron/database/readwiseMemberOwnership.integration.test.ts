import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
let deviceRoot = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_data_dir: deviceRoot, app_config_dir: path.join(deviceRoot, 'config'),
    app_cache_dir: path.join(deviceRoot, 'cache'), app_log_dir: path.join(deviceRoot, 'logs') })
}));

import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { loadReadwiseHostAssignment } from './readwiseHostAssignment.js';
import { saveReadwiseOwnerGuard } from './readwiseOwnerGuard.js';
import { saveJsonSetting } from './settingsStore.js';
import { createDesktopSyncGroup, registerSyncGroupDevice } from './syncGroupStore.js';

const members: [ReturnType<typeof createSyncGroupDeviceIdentity>, ReturnType<typeof createSyncGroupDeviceIdentity>] = [
  createSyncGroupDeviceIdentity({ group_id: 'group', device_anchor: '11111111-1111-4111-8111-111111111111',
    library_path: '/one', path_flavor: 'posix' }),
  createSyncGroupDeviceIdentity({ group_id: 'group', device_anchor: '22222222-2222-4222-8222-222222222222',
    library_path: '/two', path_flavor: 'posix' })
];
function onDevice<T>(index: number, run: () => T): T {
  closeDatabaseConnection();
  deviceRoot = path.join(root, String(index));
  return run();
}
function renameMembers(names: [string, string]) {
  for (const index of [0, 1] as const) openDatabaseConnection().driver.execute(
    'UPDATE sync_group_devices SET device_name = ? WHERE device_identity_key = ?', [names[index], members[index].identity_key]
  );
}
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-member-owner-'));
  for (const index of [0, 1] as const) onDevice(index, () => {
    initializeDatabase();
    createDesktopSyncGroup({ device: members[index], deviceName: index === 0 ? 'Old' : 'Other', platform: 'darwin' });
    registerSyncGroupDevice({ device: members[index === 0 ? 1 : 0], deviceName: index === 0 ? 'Other' : 'Old', platform: 'darwin' });
    saveJsonSetting('readwise_source_mode', { mode: 'relay', version: 1 });
  });
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it('never gives a name-only legacy owner to a matching, renamed, or duplicate member', () => {
  const scenarios: [string, string][] = [['Old', 'Other'], ['Other', 'Old'], ['Old', 'Old']];
  for (const names of scenarios) {
    for (const index of [0, 1] as const) onDevice(index, () => {
      saveJsonSetting('readwise_active_host', { host_name: 'Old' });
      renameMembers(names);
      expect(loadReadwiseHostAssignment()).toMatchObject({
        active_device_identity_key: null, active_host_name: 'Old', is_active: false
      });
      closeDatabaseConnection();
      expect(loadReadwiseHostAssignment().is_active).toBe(false);
    });
  }
});

it('keeps the selected member responsible across duplicate names, renames, and restart', () => {
  for (const index of [0, 1] as const) onDevice(index, () => {
    saveJsonSetting('readwise_active_host', { host_name: 'Old', device_identity_key: members[0].identity_key, epoch: 1 });
    if (index === 0) saveReadwiseOwnerGuard({ epoch: 1, groupId: 'group', mode: 'relay',
      ownerId: members[0].identity_key, state: 'active', targetId: null });
    const scenarios: [string, string][] = [['Old', 'Old'], ['Renamed', 'Old']];
    for (const names of scenarios) {
      renameMembers(names);
      expect(loadReadwiseHostAssignment()).toMatchObject({
        active_device_identity_key: members[0].identity_key, active_host_name: names[0], is_active: index === 0
      });
      closeDatabaseConnection();
      expect(loadReadwiseHostAssignment().is_active).toBe(index === 0);
    }
  });
});
