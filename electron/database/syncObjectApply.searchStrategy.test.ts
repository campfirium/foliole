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
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { applySyncObjectsAsync } from './syncObjectApply.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-object-search-strategy-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('applies full-text search index strategy settings through the shared setting payload path', async () => {
  const valueJson = JSON.stringify({
    [FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]: 'cjk-trigram'
  });
  const record: NativeSyncObjectRecord = {
    content_hash: 'hash-search-strategy',
    deleted_at: null,
    object_id: 'user_space:windows:desktop:*:app_settings',
    object_type: 'setting',
    payload_json: JSON.stringify({
      device_id: '*',
      form_factor: 'desktop',
      key: 'app_settings',
      platform: 'windows',
      scope: 'user_space',
      value_json: valueJson
    }),
    updated_at: '2026-04-21T16:23:00.000Z'
  };

  await expect(applySyncObjectsAsync([record])).resolves.toEqual([
    'setting:user_space:windows:desktop:*:app_settings'
  ]);

  const row = openDatabaseConnection().driver.queryOne<{ device_id: string; scope: string; value_json: string }>(
    'SELECT scope, device_id, value_json FROM setting_records WHERE key = ?',
    ['app_settings']
  );
  const parsedValue = JSON.parse(row?.value_json ?? '{}') as Record<string, unknown>;
  expect(row).toMatchObject({ device_id: '*', scope: 'user_space' });
  expect(parsedValue[FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]).toBe('cjk-trigram');
});
