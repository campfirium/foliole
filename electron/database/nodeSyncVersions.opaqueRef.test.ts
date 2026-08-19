// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-sync-opaque-ref-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: path.join(mockedAppDataDir, 'Documents'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { flushNodeSyncVersion } from './nodeSyncVersions.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-sync-opaque-ref-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('mints an opaque version ref without identity counter state', () => {
  upsertNodeSnapshot({
    nodeId: 'node-1', parentNodeId: null, kind: 'topic', title: 'Node 1', isTitleManual: true,
    content: 'Hello world', reveal: null, anchorLink: null, imageRegions: null, position: 0,
    createdAt: '2026-04-21T10:00:00.000Z', updatedAt: '2026-04-21T10:00:00.000Z'
  });

  const versionId = flushNodeSyncVersion('node-1', '2026-04-21T10:01:00.000Z');
  const connection = openDatabaseConnection();

  expect(versionId).toMatch(/^ver_[0-9a-f-]{36}$/);
  expect(connection.driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM settings WHERE key LIKE 'desktop_node_sync_%'"
  )?.count).toBe(0);
  expect(connection.driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM sync_object_state WHERE object_type = 'setting' AND object_id LIKE '%desktop_node_sync_%'"
  )?.count).toBe(0);
});
