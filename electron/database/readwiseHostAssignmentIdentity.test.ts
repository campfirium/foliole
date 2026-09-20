// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_data_dir: appDataDir,
    app_cache_dir: path.join(appDataDir, 'cache'), app_config_dir: path.join(appDataDir, 'config'),
    app_log_dir: path.join(appDataDir, 'logs') })
}));
vi.mock('../import/readwiseApiConnectionState.js', () => ({
  isStoredReadwiseApiConnectionReady: () => false
}));
vi.mock('./readwiseSourceMode.js', () => ({
  ensureReadwiseSourceModeInitialized: () => undefined,
  loadReadwiseSourceModeState: () => ({ conflictReasons: [], mode: 'relay' })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { upsertDesktopSource } from './desktopSources.js';
import { initializeDatabase } from './migrate.js';
import { canCurrentHostRunReadwise, loadReadwiseHostAssignment } from './readwiseHostAssignment.js';
import { saveReadwiseOwnerGuard } from './readwiseOwnerGuard.js';
import { saveJsonSetting } from './settingsStore.js';

let tempRoot = '';
beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-owner-identity-'));
  appDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('uses stable member identity after a rename and pauses when a new-epoch guard is missing', () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
    VALUES ('group', 'Workgroup', 'workgroup-key', 'now', 'now')`);
  driver.execute(`INSERT INTO sync_group_local_state
    (singleton_id, group_id, local_device_identity_key, state, updated_at)
    VALUES (1, 'group', 'device-this-mac', 'active', 'now')`);
  driver.execute(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
     platform, state, joined_at, left_at, last_seen_at, updated_at)
    VALUES ('group', 'device-this-mac', 'anchor', '/library/mac', 'Renamed Mac',
      'macOS', 'active', 'now', NULL, 'now', 'now')`);
  saveJsonSetting('readwise_active_host', {
    device_identity_key: 'device-this-mac', host_name: 'Old Mac'
  });
  expect(loadReadwiseHostAssignment()).toMatchObject({
    active_host_name: 'Renamed Mac', active_device_identity_key: 'device-this-mac',
    current_host_name: 'Renamed Mac', is_active: true
  });
  saveJsonSetting('readwise_active_host', {
    device_identity_key: 'device-this-mac', epoch: 1, host_name: 'Old Mac'
  });
  expect(loadReadwiseHostAssignment()).toMatchObject({
    is_active: false, activation_blocked_reason: 'guard-unavailable'
  });
});

it('lets a stopped bootstrap candidate retry without enabling execution early', async () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
    VALUES ('group', 'Workgroup', 'workgroup-key', 'now', 'now')`);
  driver.execute(`INSERT INTO sync_group_local_state
    (singleton_id, group_id, local_device_identity_key, state, updated_at)
    VALUES (1, 'group', 'device-this-mac', 'active', 'now')`);
  const members: Array<[string, string]> = [['device-this-mac', 'This Mac'], ['other-device', 'Other Mac']];
  for (const [deviceId, name] of members) {
    driver.execute(`INSERT INTO sync_group_devices
      (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
       platform, state, joined_at, left_at, last_seen_at, updated_at)
      VALUES ('group', ?, ?, ?, ?, 'macOS', 'active', 'now', NULL, 'now', 'now')`,
    [deviceId, `${deviceId}-anchor`, `/library/${deviceId}`, name]);
  }
  const rootPath = path.join(tempRoot, 'Readwise');
  await fs.mkdir(rootPath, { recursive: true });
  upsertDesktopSource({ configRef: 'readwise-a', rootPath, sourceType: 'readwise',
    typeSettings: { keepState: 'draft' }, updatedAt: 'now' });
  saveReadwiseOwnerGuard({ epoch: 0, groupId: 'group', mode: 'relay',
    ownerId: 'device-this-mac', state: 'relinquished', targetId: 'device-this-mac' });
  expect(loadReadwiseHostAssignment()).toMatchObject({ is_active: false, legacy_unassigned: true,
    activation_blocked_reason: 'group-quiescence-required' });
  expect(canCurrentHostRunReadwise()).toBe(false);
});
