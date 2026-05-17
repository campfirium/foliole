// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const executorMock = vi.hoisted(() => ({
  apply: vi.fn(async () => ['setting:user_space:*:*:*:batch_1', 'setting:user_space:*:*:*:batch_2'])
}));

let mockedAppDataDir = '/tmp/foliole-sync-object-apply-wrapper-batch-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('../../lib/core/sync/syncObjectApplyExecutor.js', () => ({
  applySyncObjectsWithDbPort: executorMock.apply
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { applySyncObjectsAsync } from './syncObjectApply.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-object-apply-wrapper-batch-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  executorMock.apply.mockClear();
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function settingRecord(index: number): NativeSyncObjectRecord {
  return {
    content_hash: `hash-wrapper-${index}`,
    deleted_at: null,
    object_id: `user_space:*:*:*:batch_${index}`,
    object_type: 'setting',
    payload_json: JSON.stringify({ key: `batch_${index}`, value_json: '{}' }),
    updated_at: `2026-04-21T16:0${index}:00.000Z`
  };
}

it('passes desktop apply records to the shared executor as one batch', async () => {
  const records = [settingRecord(1), settingRecord(2)];

  await expect(applySyncObjectsAsync(records)).resolves.toEqual([
    'setting:user_space:*:*:*:batch_1',
    'setting:user_space:*:*:*:batch_2'
  ]);

  expect(executorMock.apply).toHaveBeenCalledTimes(1);
  expect(executorMock.apply).toHaveBeenCalledWith(expect.anything(), records, expect.objectContaining({
    onSkippedRecord: expect.any(Function)
  }));
});
