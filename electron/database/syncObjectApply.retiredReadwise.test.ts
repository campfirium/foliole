// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-retired-readwise-sync-tests';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'), app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir, app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { applySyncObjectsWithDbPort } from '../../lib/core/sync/syncObjectApplyExecutor.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-retired-readwise-sync-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('turns a late experimental Readwise payload into a tombstone without materializing it', async () => {
  const updatedAt = '2026-08-17T00:00:00.000Z';
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'retired-readwise' });
  await applySyncObjectsWithDbPort(port, [{
    content_hash: 'legacy-hash', deleted_at: null, object_id: 'legacy-binding',
    object_type: 'readwise_binding', payload_json: '{"primary_path":"/remote/readwise"}', updated_at: updatedAt
  }]);
  expect(openDatabaseConnection().driver.queryOne(
    `SELECT deleted_at FROM sync_object_state WHERE object_type = 'readwise_binding' AND object_id = 'legacy-binding'`
  )).toEqual({ deleted_at: updatedAt });
  expect(openDatabaseConnection().driver.queryOne(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'readwise_%'"
  )).toBeUndefined();
});
