// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-object-apply-batching-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import {
  applySyncObjectsWithDbPort,
  SYNC_OBJECT_APPLY_BATCH_SIZE
} from '../../lib/core/sync/syncObjectApplyExecutor.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-object-apply-batching-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function settingRecord(index: number, payloadJson?: string): NativeSyncObjectRecord {
  return {
    content_hash: `hash-batch-${index}`,
    deleted_at: null,
    object_id: `user_space:*:*:*:batch_${index}`,
    object_type: 'setting',
    payload_json: payloadJson ?? JSON.stringify({
      key: `batch_${index}`,
      scope: 'user_space',
      value_json: `{"index":${index}}`
    }),
    updated_at: `2026-04-21T16:${String(index).padStart(2, '0')}:00.000Z`
  };
}

function createCountingPort() {
  const basePort = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'sync-object-batching-test' });
  let transactionCount = 0;
  const port: DbPort = {
    ...basePort,
    async transaction<T>(execute: (tx: DbPort) => Promise<T>) {
      transactionCount += 1;
      return basePort.transaction(execute);
    }
  };
  return {
    get transactionCount() {
      return transactionCount;
    },
    port
  };
}

it('applies many sync objects in bounded batches instead of per-record transactions', async () => {
  const records = Array.from({ length: 100 }, (_, index) => settingRecord(index));
  const counting = createCountingPort();

  await expect(applySyncObjectsWithDbPort(counting.port, records)).resolves.toHaveLength(records.length);

  expect(counting.transactionCount).toBeLessThan(records.length);
  expect(counting.transactionCount).toBeLessThanOrEqual(Math.ceil(records.length / SYNC_OBJECT_APPLY_BATCH_SIZE));
});

it('rolls back a failed batch and retries records individually', async () => {
  const skipped = vi.fn();
  const records = [
    settingRecord(1),
    settingRecord(2, '{'),
    settingRecord(3)
  ];
  const counting = createCountingPort();

  await expect(applySyncObjectsWithDbPort(counting.port, records, { onSkippedRecord: skipped }))
    .resolves.toEqual(['setting:user_space:*:*:*:batch_1', 'setting:user_space:*:*:*:batch_3']);

  expect(skipped).toHaveBeenCalledTimes(1);
  expect(counting.transactionCount).toBeGreaterThan(1);
  expect(openDatabaseConnection().driver.queryOne<{ value_json: string }>(
    'SELECT value_json FROM setting_records WHERE key = ?',
    ['batch_1']
  )).toEqual({ value_json: '{"index":1}' });
  expect(openDatabaseConnection().driver.queryOne(
    'SELECT object_id FROM sync_object_state WHERE object_id = ?',
    ['user_space:*:*:*:batch_2']
  )).toBeUndefined();
});
