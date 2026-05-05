// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-object-apply-isolation-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { applySyncObjectsAsync } from './syncObjectApply.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-object-apply-isolation-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('skips malformed records without blocking later valid records', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const records = [{
    content_hash: 'bad-hash',
    deleted_at: null,
    object_id: 'bad-setting',
    object_type: 'setting',
    payload_json: '{',
    updated_at: '2026-04-21T16:00:00.000Z'
  }, {
    content_hash: 'missing-object-id-hash',
    deleted_at: null,
    object_type: 'setting',
    payload_json: JSON.stringify({ key: 'missing_object_id' }),
    updated_at: '2026-04-21T16:00:30.000Z'
  }, {
    content_hash: 'good-hash',
    deleted_at: null,
    object_id: 'device:android:phone:*:sync_reminder',
    object_type: 'setting',
    payload_json: JSON.stringify({
      key: 'sync_reminder',
      scope: 'device',
      platform: 'android',
      form_factor: 'phone',
      device_id: '*',
      value_json: '{"enabled":true}'
    }),
    updated_at: '2026-04-21T16:01:00.000Z'
  }] as unknown as NativeSyncObjectRecord[];

  await expect(applySyncObjectsAsync(records)).resolves.toEqual(['setting:device:android:phone:*:sync_reminder']);
  expect(warn).toHaveBeenCalled();

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne('SELECT object_id FROM sync_object_state WHERE object_id = ?', ['bad-setting'])).toBeUndefined();
  expect(driver.queryOne('SELECT key FROM setting_records WHERE key = ?', ['missing_object_id'])).toBeUndefined();
  expect(driver.queryOne<{ value_json: string }>('SELECT value_json FROM setting_records WHERE key = ?', ['sync_reminder']))
    .toEqual({ value_json: '{"enabled":true}' });
});
