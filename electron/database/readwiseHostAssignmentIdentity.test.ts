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
import { initializeDatabase } from './migrate.js';
import { loadReadwiseHostAssignment } from './readwiseHostAssignment.js';
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
