// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-nodes-restore-incarnation-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { loadSyncNodeVersionsSince } from './syncNodes.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-nodes-restore-incarnation-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('keeps restored version ids after legacy ids when created_at ties', () => {
  const connection = openDatabaseConnection();
  connection.driver.execute(
    `INSERT INTO nodes (id, kind, title, content, current_version_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      'node-1',
      'topic',
      'Node 1',
      '',
      'desktop#zrestore-aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa#2',
      '2026-04-21T10:00:00.000Z',
      '2026-04-21T11:00:00.000Z'
    ]
  );
  insertVersion('desktop#1', '2026-04-21T10:30:00.000Z', 'hash-1', null);
  insertVersion('desktop#2', '2026-04-21T11:00:00.000Z', 'hash-2', 'desktop#1');
  insertVersion(
    'desktop#zrestore-aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa#2',
    '2026-04-21T11:00:00.000Z',
    'hash-restored',
    'desktop#2'
  );

  const records = loadSyncNodeVersionsSince(
    { createdAt: '2026-04-21T10:30:00.000Z', versionId: 'desktop#1' },
    10
  );

  expect(records.map((record) => record.version_id)).toEqual([
    'desktop#2',
    'desktop#zrestore-aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa#2'
  ]);
  expect(loadSyncNodeVersionsSince(
    { createdAt: '2026-04-21T11:00:00.000Z', versionId: 'desktop#2' },
    10
  ).map((record) => record.version_id)).toEqual([
    'desktop#zrestore-aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa#2'
  ]);
});

function insertVersion(
  versionId: string,
  createdAt: string,
  contentHash: string,
  parentVersionId: string | null
) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, host_name, created_at, content_hash
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [versionId, 'node-1', parentVersionId, 'desktop', createdAt, contentHash]
  );
}
