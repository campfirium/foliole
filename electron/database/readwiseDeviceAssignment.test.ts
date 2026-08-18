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
  expect(loadReadwiseDeviceAssignment()).toMatchObject({ is_active: true, legacy_unassigned: true });
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
