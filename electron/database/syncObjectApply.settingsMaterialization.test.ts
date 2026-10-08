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

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { buildCanonicalSyncTombstone } from '../../lib/core/sync/canonicalSyncTombstone.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';
import { loadReviewSchedulerSettings } from '../reviewSchedulerSettings.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDesktopDeviceProfileFixture } from './deviceIdentityTestSupport.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
import { initializeDatabase } from './migrate.js';
import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';
import { applySyncObjectsAsync } from './syncObjectApply.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-setting-materialization-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  await initializeDatabase();
  initializeDesktopDeviceProfileFixture('desktop-host');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function settingRecord(args: {
  deletedAt?: string | null;
  formFactor: string;
  hostName: string;
  key: string;
  platform: string;
  scope: string;
  updatedAt: string;
  valueJson?: string;
}): NativeSyncObjectRecord {
  const objectId = `${args.scope}:${args.platform}:${args.formFactor}:${args.hostName}:${args.key}`;
  const payload = {
    form_factor: args.formFactor, host_name: args.hostName, key: args.key,
    platform: args.platform, scope: args.scope, value_json: args.valueJson ?? 'null'
  };
  return {
    content_hash: computeSyncContentHash('setting', args.deletedAt
      ? buildCanonicalSyncTombstone(objectId) : payload),
    deleted_at: args.deletedAt ?? null,
    object_id: objectId,
    object_type: 'setting',
    payload_json: args.deletedAt ? null : JSON.stringify(payload),
    updated_at: args.updatedAt
  };
}

it('materializes an accepted workspace setting and preserves it after database restart', async () => {
  const record = settingRecord({
    formFactor: 'desktop',
    hostName: '*',
    key: 'search_aliases_document',
    platform: 'windows',
    scope: 'user_space',
    updatedAt: '2026-07-10T00:01:00.000Z',
    valueJson: '{"aliases":["shared-search"]}'
  });

  await expect(applySyncObjectsAsync([record])).resolves.toEqual([
    'setting:user_space:windows:desktop:*:search_aliases_document'
  ]);
  expect(loadJsonSetting('search_aliases_document')).toEqual({ aliases: ['shared-search'] });

  closeDatabaseConnection();
  await initializeDatabase();
  expect(loadJsonSetting('search_aliases_document')).toEqual({ aliases: ['shared-search'] });
});

it('ignores legacy shared device preferences without creating accepted state', async () => {
  saveJsonSetting('app_settings', { theme: 'light', fontSize: 19 });
  const record = settingRecord({ formFactor: 'desktop', hostName: '*', key: 'app_settings',
    platform: 'windows', scope: 'user_space', updatedAt: '2099-07-10T00:01:00.000Z',
    valueJson: '{"theme":"dark","fontSize":12}' });
  await expect(applySyncObjectsAsync([record])).resolves.toEqual([]);
  expect(loadJsonSetting('app_settings')).toEqual({ theme: 'light', fontSize: 19 });
  const driver = openDatabaseConnection().driver;
  expect(driver.queryAll('SELECT * FROM setting_records WHERE key = ? AND scope = ?',
    ['app_settings', 'user_space'])).toEqual([]);
  expect(driver.queryAll('SELECT * FROM sync_object_state WHERE object_type = ? AND object_id = ?',
    ['setting', record.object_id])).toEqual([]);
});

it('materializes the current Host import config and keeps other Host values isolated', async () => {
  const host = loadOrCreateDesktopHostName();
  const record = settingRecord({
    formFactor: 'desktop',
    hostName: host,
    key: 'import_manager_settings',
    platform: 'windows',
    scope: 'host',
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
  const foreign = settingRecord({ formFactor: 'desktop', hostName: 'other-desktop-host',
    key: 'import_manager_settings', platform: 'windows', scope: 'host',
    updatedAt: '2026-09-12T00:00:00.000Z',
    valueJson: JSON.stringify({ readwiseAutoImportPolicy: { importTag: 'foreign', version: 3 }, version: 5 }) });
  await expect(applySyncObjectsAsync([foreign])).resolves.toEqual([]);
  expect(loadJsonSetting('import_manager_settings')).toMatchObject({
    readwiseAutoImportPolicy: { importTag: 'favorite', version: 3 }
  });
});

it('waits for the matching cutover proof before materializing API mode', async () => {
  const completion = {
    batchId: 'batch-1', completedAt: '2027-09-15T00:02:00.000Z',
    sourceHost: 'Source Mac', startedAt: '2027-09-15T00:01:00.000Z'
  };
  const mode = settingRecord({
    formFactor: 'desktop', hostName: '*',
    key: 'readwise_source_mode', platform: 'windows', scope: 'user_space',
    updatedAt: completion.completedAt,
    valueJson: JSON.stringify({ completion, mode: 'api', version: 1 })
  });
  const cutover = settingRecord({
    formFactor: 'desktop', hostName: '*',
    key: 'readwise_source_cutover_v2', platform: 'windows', scope: 'user_space',
    updatedAt: completion.completedAt,
    valueJson: JSON.stringify({
      annotations: [], batchId: completion.batchId, cohortDocumentIds: [],
      completedAt: completion.completedAt, completionVersion: 7, documents: [], phase: null,
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
    formFactor: 'desktop', hostName: '*',
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
    formFactor: 'desktop', hostName: '*',
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
