// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-object-state-types-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { applySyncObjects } from './syncObjectApply.js';
import { applySyncObjectPayload } from './syncObjectApplyPayloads.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-object-state-types-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('does not accept node records through the generic state-object apply path', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const record = {
    content_hash: 'hash-node',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node',
    payload_json: JSON.stringify({ id: 'node-1', title: 'Wrong path' }),
    updated_at: '2026-04-21T16:20:00.000Z'
  } as unknown as NativeSyncObjectRecord;

  expect(applySyncObjects([record])).toEqual([]);

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne('SELECT id FROM nodes WHERE id = ?', ['node-1'])).toBeUndefined();
  expect(driver.queryOne('SELECT object_id FROM sync_object_state WHERE object_type = ?', ['node'])).toBeUndefined();
});

it('rejects unsupported object types at the payload apply boundary', () => {
  const record = {
    content_hash: 'hash-node',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node',
    payload_json: JSON.stringify({ id: 'node-1' }),
    updated_at: '2026-04-21T16:20:00.000Z'
  } as unknown as NativeSyncObjectRecord;

  expect(() => applySyncObjectPayload(openDatabaseConnection().driver, record)).toThrow('Unsupported sync object type');
});
