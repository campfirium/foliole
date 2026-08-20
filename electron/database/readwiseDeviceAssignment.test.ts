// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-device-tests';

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
  activateReadwiseOnThisDevice,
  canCurrentDeviceRunReadwise,
  loadReadwiseDeviceAssignment
} from './readwiseDeviceAssignment.js';
import { saveJsonSetting } from './settingsStore.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-device-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('keeps legacy Readwise active until a Host is explicitly selected, then runs only on that Host', () => {
  const currentHost = 'This Mac';
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO sync_groups (group_id, display_name, timeline_id, created_by_host_name, created_at, updated_at)
     VALUES ('group', 'Workgroup', 'timeline', ?, 'now', 'now')`, [currentHost]
  );
  driver.execute(
    `INSERT INTO sync_group_local_state (singleton_id, group_id, local_host_name, member_state, updated_at)
     VALUES (1, 'group', ?, 'active', 'now')`, [currentHost]
  );
  for (const hostName of [currentHost, 'Office PC']) {
    driver.execute(
      `INSERT INTO sync_group_members (group_id, host_name, host_platform, state,
         approved_by_host_name, authorization_id, joined_at, updated_at)
       VALUES ('group', ?, 'darwin', 'active', ?, ?, 'now', 'now')`,
      [hostName, currentHost, `authorization-${hostName}`]
    );
  }
  expect(loadReadwiseDeviceAssignment()).toMatchObject({
    devices: [
      { device_id: 'Office PC', device_name: 'Office PC', platform: 'darwin' },
      { device_id: currentHost, device_name: currentHost, platform: 'darwin' }
    ],
    is_active: true,
    legacy_unassigned: true
  });
  saveJsonSetting('readwise_active_device', { device_id: 'Office PC' });

  expect(loadReadwiseDeviceAssignment()).toMatchObject({
    active_device_id: 'Office PC', current_device_id: currentHost, is_active: false, legacy_unassigned: false
  });
  expect(canCurrentDeviceRunReadwise()).toBe(false);

  expect(activateReadwiseOnThisDevice()).toMatchObject({
    active_device_id: currentHost, current_device_id: currentHost, is_active: true, legacy_unassigned: false
  });
  expect(openDatabaseConnection().driver.queryOne<{ sync_dirty: number }>(
    `SELECT s.sync_dirty FROM sync_object_state s
     JOIN setting_records r ON s.object_id = r.scope || ':' || r.platform || ':' || r.form_factor || ':' || r.host_name || ':' || r.key
     WHERE s.object_type = 'setting' AND r.key = 'readwise_active_device'`
  )).toEqual({ sync_dirty: 1 });
});

it('runs Readwise only when every configured Source belongs to this installation', () => {
  upsertDesktopSource({
    configRef: 'readwise-a', rootPath: '/Readwise', sourceType: 'readwise', updatedAt: 'now'
  });
  expect(canCurrentDeviceRunReadwise()).toBe(true);
  openDatabaseConnection().driver.execute(
    "UPDATE desktop_sources SET owner_installation_id = NULL WHERE source_type = 'readwise'"
  );
  expect(canCurrentDeviceRunReadwise()).toBe(false);
});
