// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-watched-folder-apply-tests';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir, app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'), app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { applySyncObjectsWithDbPort } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-watched-folder-apply-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function record(owner: string, revision: string, updatedAt: string): NativeSyncObjectRecord {
  return {
    content_hash: `${owner}-${revision}`, deleted_at: null, object_id: 'watched-1', object_type: 'watched_folder',
    payload_json: JSON.stringify({
      action_mode: 'keep', archive_path: '', availability: 'available', binding_id: 'watched-1',
      claim_revision: revision, claim_state: 'claimed', created_at: '2026-08-17T00:00:00.000Z', enabled: 1,
      highlight_mode: 'merged', highlight_path: '', keep_preview_json: null,
      owner_device_name: owner, owner_installation_id: owner, owner_platform: 'darwin', primary_path: `/source/${owner}`
    }),
    updated_at: updatedAt
  };
}

it('preserves the first owner and disables a competing owner revision', async () => {
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'watched-folder-apply' });
  await applySyncObjectsWithDbPort(port, [record('desktop-a', 'revision-a', '2026-08-17T00:00:01.000Z')]);
  await applySyncObjectsWithDbPort(port, [record('desktop-b', 'revision-b', '2026-08-17T00:00:02.000Z')]);

  expect(openDatabaseConnection().driver.queryOne(
    `SELECT owner_installation_id, claim_revision, claim_state, enabled, primary_path
     FROM watched_folder_bindings WHERE binding_id = 'watched-1'`
  )).toEqual({
    claim_revision: 'revision-a', claim_state: 'conflict', enabled: 0,
    owner_installation_id: 'desktop-a', primary_path: '/source/desktop-a'
  });
});
