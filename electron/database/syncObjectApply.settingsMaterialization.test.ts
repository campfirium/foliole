// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-setting-materialization-tests';

vi.mock('electron', () => ({
  app: { getPath: () => mockedAppDataDir },
  safeStorage: {}
}));

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
import { initializeDesktopDeviceProfileFixture } from './deviceIdentityTestSupport.js';
import { initializeDatabase } from './migrate.js';
import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';
import { applySyncObjectsAsync } from './syncObjectApply.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-setting-materialization-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  initializeDesktopDeviceProfileFixture('desktop-host');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function settingRecord(args: {
  contentHash: string;
  deletedAt?: string | null;
  formFactor: string;
  hostName: string;
  key: string;
  platform: string;
  scope: string;
  updatedAt: string;
  valueJson?: string;
}): NativeSyncObjectRecord {
  return {
    content_hash: args.contentHash,
    deleted_at: args.deletedAt ?? null,
    object_id: `${args.scope}:${args.platform}:${args.formFactor}:${args.hostName}:${args.key}`,
    object_type: 'setting',
    payload_json: args.deletedAt ? null : JSON.stringify({
      form_factor: args.formFactor,
      host_name: args.hostName,
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
    formFactor: 'desktop',
    hostName: '*',
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

it('materializes the Readwise import tag without turning it into Host state', async () => {
  const record = settingRecord({
    contentHash: 'remote-readwise-policy',
    formFactor: 'desktop',
    hostName: '*',
    key: 'import_manager_settings',
    platform: 'windows',
    scope: 'user_space',
    updatedAt: '2026-09-11T00:00:00.000Z',
    valueJson: JSON.stringify({
      readwiseAutoImportPolicy: { importTag: 'favorite', version: 3 },
      version: 5
    })
  });

  await expect(applySyncObjectsAsync([record])).resolves.toHaveLength(1);
  expect(loadJsonSetting('import_manager_settings')).toMatchObject({
    readwiseAutoImportPolicy: { importTag: 'favorite', version: 3 }
  });
  expect(loadJsonSetting('readwise_import_settings')).toBeNull();
});

it('waits for the matching cutover proof before materializing API mode', async () => {
  const completion = {
    batchId: 'batch-1', completedAt: '2027-09-15T00:02:00.000Z',
    sourceHost: 'Source Mac', startedAt: '2027-09-15T00:01:00.000Z'
  };
  const mode = settingRecord({
    contentHash: 'readwise-mode-api', formFactor: 'desktop', hostName: '*',
    key: 'readwise_source_mode', platform: 'windows', scope: 'user_space',
    updatedAt: completion.completedAt,
    valueJson: JSON.stringify({ completion, mode: 'api', version: 1 })
  });
  const cutover = settingRecord({
    contentHash: 'readwise-cutover-api', formFactor: 'desktop', hostName: '*',
    key: 'readwise_source_cutover_v2', platform: 'windows', scope: 'user_space',
    updatedAt: completion.completedAt,
    valueJson: JSON.stringify({
      annotations: [], batchId: completion.batchId, cohortDocumentIds: [],
      completedAt: completion.completedAt, completionVersion: 5, documents: [], phase: null,
      retiredNodeIds: [], sourceHost: completion.sourceHost, startedAt: completion.startedAt,
      status: 'api', version: 2
    })
  });

  await applySyncObjectsAsync([mode]);
  expect(loadJsonSetting('readwise_source_mode')).toEqual({ mode: 'relay', version: 1 });

  await applySyncObjectsAsync([cutover]);
  expect(loadJsonSetting('readwise_source_mode')).toEqual({ completion, mode: 'api', version: 1 });
});

it('does not materialize API mode when the cutover proof differs', async () => {
  const mode = settingRecord({
    contentHash: 'readwise-mode-unproved', formFactor: 'desktop', hostName: '*',
    key: 'readwise_source_mode', platform: 'windows', scope: 'user_space',
    updatedAt: '2026-09-15T00:02:00.000Z',
    valueJson: JSON.stringify({
      completion: {
        batchId: 'mode-batch', completedAt: 'done', sourceHost: 'Source Mac', startedAt: 'start'
      },
      mode: 'api', version: 1
    })
  });
  const cutover = settingRecord({
    contentHash: 'readwise-cutover-different', formFactor: 'desktop', hostName: '*',
    key: 'readwise_source_cutover_v2', platform: 'windows', scope: 'user_space',
    updatedAt: '2026-09-15T00:01:00.000Z',
    valueJson: JSON.stringify({
      annotations: [], batchId: 'other-batch', cohortDocumentIds: [], completedAt: 'done',
      completionVersion: 2, documents: [], phase: null, retiredNodeIds: [],
      sourceHost: 'Source Mac', startedAt: 'start', status: 'api', version: 2
    })
  });

  await applySyncObjectsAsync([cutover, mode]);
  expect(loadJsonSetting('readwise_source_mode')).toEqual({ mode: 'relay', version: 1 });
});

it('materializes a tombstone as projection deletion and consumers recover defaults', async () => {
  saveJsonSetting('review_scheduler_settings', { desiredRetention: 0.9 }, '2026-07-10T00:01:00.000Z');
  const tombstone = settingRecord({
    contentHash: 'remote-review-delete',
    deletedAt: '2026-07-10T00:02:00.000Z',
    formFactor: 'desktop',
    hostName: '*',
    key: 'review_scheduler_settings',
    platform: 'windows',
    scope: 'user_space',
    updatedAt: '2026-07-10T00:02:00.000Z'
  });

  await expect(applySyncObjectsAsync([tombstone])).resolves.toHaveLength(1);
  expect(loadJsonSetting('review_scheduler_settings')).toBeNull();
  expect(() => loadReviewSchedulerSettings()).not.toThrow();
});

it('does not materialize foreign Android Host settings into the desktop projection', async () => {
  saveJsonSetting('app_settings', { theme: 'light' }, '2026-07-10T00:01:00.000Z');
  const androidRecord = settingRecord({
    contentHash: 'android-app-settings',
    formFactor: 'phone',
    hostName: 'android-host',
    key: 'app_settings',
    platform: 'android',
    scope: 'host',
    updatedAt: '2026-07-10T00:02:00.000Z',
    valueJson: '{"theme":"dark"}'
  });

  await expect(applySyncObjectsAsync([androidRecord])).resolves.toEqual([]);
  expect(loadJsonSetting('app_settings')).toEqual({ theme: 'light' });
});
