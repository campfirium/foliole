// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-host-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { upsertDesktopSource } from './desktopSources.js';
import { initializeDatabase } from './migrate.js';
import {
  activateReadwiseOnThisHost,
  canCurrentHostRunReadwise,
  loadReadwiseHostAssignment
} from './readwiseHostAssignment.js';
import { saveJsonSetting } from './settingsStore.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-host-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('keeps Readwise active until a Host is explicitly selected, then runs only on that Host', () => {
  const currentHost = 'This Mac';
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
     VALUES ('group', 'Workgroup', 'workgroup-key', 'now', 'now')`
  );
  driver.execute(
    `INSERT INTO sync_group_local_state
       (singleton_id, group_id, local_device_identity_key, state, updated_at)
     VALUES (1, 'group', 'device-this-mac', 'active', 'now')`
  );
  const devices: Array<[string, string]> = [
    ['device-this-mac', currentHost],
    ['device-office-pc', 'Office PC']
  ];
  for (const [deviceId, hostName] of devices) {
    driver.execute(
      `INSERT INTO sync_group_devices
        (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
         platform, state, joined_at, left_at, last_seen_at, updated_at)
       VALUES ('group', ?, ?, ?, ?, 'darwin', 'active', 'now', NULL, 'now', 'now')`,
      [deviceId, `${deviceId}-anchor`, `/library/${deviceId}`, hostName]
    );
  }
  expect(loadReadwiseHostAssignment()).toMatchObject({
    hosts: [
      { host_name: 'Office PC', platform: 'darwin' },
      { host_name: currentHost, platform: 'darwin' }
    ],
    is_active: true,
    legacy_unassigned: true
  });
  saveJsonSetting('readwise_active_host', { host_name: 'Office PC' });

  expect(loadReadwiseHostAssignment()).toMatchObject({
    active_host_name: 'Office PC', current_host_name: currentHost, is_active: false, legacy_unassigned: false
  });
  expect(canCurrentHostRunReadwise()).toBe(false);

  expect(activateReadwiseOnThisHost()).toMatchObject({
    active_host_name: currentHost, current_host_name: currentHost, is_active: true, legacy_unassigned: false
  });
  expect(openDatabaseConnection().driver.queryOne<{ sync_dirty: number }>(
    `SELECT s.sync_dirty FROM sync_object_state s
     JOIN setting_records r ON s.object_id = r.scope || ':' || r.platform || ':' || r.form_factor || ':' || r.host_name || ':' || r.key
     WHERE s.object_type = 'setting' AND r.key = 'readwise_active_host'`
  )).toEqual({ sync_dirty: 1 });
});

it('runs Readwise for the current Host when another enabled category directory is absent', async () => {
  const rootPath = path.join(tempRoot, 'Readwise');
  await fs.mkdir(rootPath, { recursive: true });
  upsertDesktopSource({
    configRef: 'readwise-a', rootPath, sourceType: 'readwise', typeSettings: { keepState: 'enabled' }, updatedAt: 'now'
  });
  upsertDesktopSource({
    configRef: 'readwise-missing',
    rootPath: path.join(tempRoot, 'Missing'),
    sourceType: 'readwise',
    typeSettings: { keepState: 'enabled' },
    updatedAt: 'now'
  });
  expect(canCurrentHostRunReadwise()).toBe(true);
  upsertDesktopSource({
    configRef: 'readwise-remote',
    hostName: 'Other Mac',
    rootPath,
    sourceType: 'readwise',
    typeSettings: { keepState: 'enabled' },
    updatedAt: 'later'
  });
  expect(canCurrentHostRunReadwise()).toBe(true);
  openDatabaseConnection().driver.execute(
    "UPDATE desktop_sources SET host_name = 'Other Mac' WHERE source_type = 'readwise'"
  );
  expect(canCurrentHostRunReadwise()).toBe(false);
});
