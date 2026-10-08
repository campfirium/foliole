// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-object-search-strategy-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY } from '../../lib/core/database/fullTextSearchIndexStrategy.js';
import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDesktopDeviceProfileFixture } from './deviceIdentityTestSupport.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
import { loadJsonSetting } from './settingsStore.js';
import { applySyncObjectsAsync } from './syncObjectApply.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-object-search-strategy-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-host');
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function strategyRecord(hostName: string, scope: 'host' | 'user_space', strategy: string): NativeSyncObjectRecord {
  const payload = {
    host_name: hostName, form_factor: 'desktop', key: 'app_settings',
    platform: 'windows', scope,
    value_json: JSON.stringify({ [FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]: strategy })
  };
  return {
    content_hash: computeSyncContentHash('setting', payload),
    deleted_at: null,
    object_id: `${scope}:windows:desktop:${hostName}:app_settings`,
    object_type: 'setting',
    payload_json: JSON.stringify(payload),
    updated_at: '2026-04-21T16:23:00.000Z'
  };
}

it('applies the current Host search strategy and isolates other Host and legacy shared settings', async () => {
  const host = loadOrCreateDesktopHostName();
  const record = strategyRecord(host, 'host', 'cjk-trigram');
  await expect(applySyncObjectsAsync([record])).resolves.toEqual([`setting:${record.object_id}`]);

  const row = openDatabaseConnection().driver.queryOne<{ host_name: string; scope: string; value_json: string }>(
    'SELECT scope, host_name, value_json FROM setting_records WHERE key = ? AND scope = ? AND host_name = ?',
    ['app_settings', 'host', host]
  );
  const parsedValue = JSON.parse(row?.value_json ?? '{}') as Record<string, unknown>;
  expect(row).toMatchObject({ host_name: host, scope: 'host' });
  expect(parsedValue[FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]).toBe('cjk-trigram');
  expect(loadJsonSetting('app_settings')).toEqual(parsedValue);

  for (const foreign of [strategyRecord('other-desktop-host', 'host', 'word-based'),
    strategyRecord('*', 'user_space', 'word-based')]) {
    await expect(applySyncObjectsAsync([foreign])).resolves.toEqual([]);
    expect(loadJsonSetting('app_settings')).toEqual(parsedValue);
  }
});
