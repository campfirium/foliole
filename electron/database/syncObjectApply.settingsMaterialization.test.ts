// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-setting-materialization-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';
import { loadReviewSchedulerSettings } from '../reviewSchedulerSettings.js';

import { closeDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';
import { applySyncObjectsAsync } from './syncObjectApply.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-setting-materialization-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  saveJsonSetting('device_id', 'desktop-device', '2026-07-10T00:00:00.000Z');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function settingRecord(args: {
  contentHash: string;
  deletedAt?: string | null;
  deviceId: string;
  formFactor: string;
  key: string;
  platform: string;
  scope: string;
  updatedAt: string;
  valueJson?: string;
}): NativeSyncObjectRecord {
  return {
    content_hash: args.contentHash,
    deleted_at: args.deletedAt ?? null,
    object_id: `${args.scope}:${args.platform}:${args.formFactor}:${args.deviceId}:${args.key}`,
    object_type: 'setting',
    payload_json: args.deletedAt ? null : JSON.stringify({
      device_id: args.deviceId,
      form_factor: args.formFactor,
      key: args.key,
      platform: args.platform,
      scope: args.scope,
      value_json: args.valueJson ?? 'null'
    }),
    updated_at: args.updatedAt
  };
}

it('materializes an accepted workspace setting and preserves it after database restart', async () => {
  const record = settingRecord({
    contentHash: 'remote-app-settings',
    deviceId: '*',
    formFactor: 'desktop',
    key: 'app_settings',
    platform: 'windows',
    scope: 'user_space',
    updatedAt: '2026-07-10T00:01:00.000Z',
    valueJson: '{"theme":"dark"}'
  });

  await expect(applySyncObjectsAsync([record])).resolves.toEqual([
    'setting:user_space:windows:desktop:*:app_settings'
  ]);
  expect(loadJsonSetting('app_settings')).toEqual({ theme: 'dark' });

  closeDatabaseConnection();
  initializeDatabase();
  expect(loadJsonSetting('app_settings')).toEqual({ theme: 'dark' });
});

it('materializes a tombstone as projection deletion and consumers recover defaults', async () => {
  saveJsonSetting('review_scheduler_settings', { desiredRetention: 0.9 }, '2026-07-10T00:01:00.000Z');
  const tombstone = settingRecord({
    contentHash: 'remote-review-delete',
    deletedAt: '2026-07-10T00:02:00.000Z',
    deviceId: '*',
    formFactor: 'desktop',
    key: 'review_scheduler_settings',
    platform: 'windows',
    scope: 'user_space',
    updatedAt: '2026-07-10T00:02:00.000Z'
  });

  await expect(applySyncObjectsAsync([tombstone])).resolves.toHaveLength(1);
  expect(loadJsonSetting('review_scheduler_settings')).toBeNull();
  expect(() => loadReviewSchedulerSettings()).not.toThrow();
});

it('does not materialize Android or foreign-device settings into the desktop projection', async () => {
  saveJsonSetting('app_settings', { theme: 'light' }, '2026-07-10T00:01:00.000Z');
  const androidRecord = settingRecord({
    contentHash: 'android-app-settings',
    deviceId: 'android-device',
    formFactor: 'phone',
    key: 'app_settings',
    platform: 'android',
    scope: 'device',
    updatedAt: '2026-07-10T00:02:00.000Z',
    valueJson: '{"theme":"dark"}'
  });

  await expect(applySyncObjectsAsync([androidRecord])).resolves.toHaveLength(1);
  expect(loadJsonSetting('app_settings')).toEqual({ theme: 'light' });
});
