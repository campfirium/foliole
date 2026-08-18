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
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';
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

it('keeps legacy Readwise active until a device is explicitly selected, then runs only on that device', () => {
  const currentDeviceId = loadOrCreateDesktopDeviceId();
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO sync_groups (group_id, display_name, timeline_id, created_by_device_id, created_at, updated_at)
     VALUES ('group', 'Workgroup', 'timeline', ?, 'now', 'now')`, [currentDeviceId]
  );
  driver.execute(
    `INSERT INTO sync_group_local_state (singleton_id, group_id, local_device_id, member_state, updated_at)
     VALUES (1, 'group', ?, 'active', 'now')`, [currentDeviceId]
  );
  for (const [deviceId, name] of [[currentDeviceId, 'This Mac'], ['remote-device', 'Office PC']] as const) {
    driver.execute(
      `INSERT INTO sync_group_members (group_id, device_id, device_kind, device_name, state,
         approved_by_device_id, authorization_id, joined_at, updated_at)
       VALUES ('group', ?, 'darwin', ?, 'active', ?, ?, 'now', 'now')`,
      [deviceId, name, currentDeviceId, `authorization-${deviceId}`]
    );
  }
  expect(loadReadwiseDeviceAssignment()).toMatchObject({
    devices: [
      { device_id: 'remote-device', device_name: 'Office PC' },
      { device_id: currentDeviceId, device_name: 'This Mac' }
    ],
    is_active: true,
    legacy_unassigned: true
  });
  saveJsonSetting('readwise_active_device', { device_id: 'remote-device' });

  expect(loadReadwiseDeviceAssignment()).toMatchObject({
    active_device_id: 'remote-device', current_device_id: currentDeviceId, is_active: false, legacy_unassigned: false
  });
  expect(canCurrentDeviceRunReadwise()).toBe(false);

  expect(activateReadwiseOnThisDevice()).toMatchObject({
    active_device_id: currentDeviceId, current_device_id: currentDeviceId, is_active: true, legacy_unassigned: false
  });
  expect(openDatabaseConnection().driver.queryOne<{ sync_dirty: number }>(
    `SELECT s.sync_dirty FROM sync_object_state s
     JOIN setting_records r ON s.object_id = r.scope || ':' || r.platform || ':' || r.form_factor || ':' || r.device_id || ':' || r.key
     WHERE s.object_type = 'setting' AND r.key = 'readwise_active_device'`
  )).toEqual({ sync_dirty: 1 });
});
