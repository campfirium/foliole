// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-sync-versions-tests';
let mockedDocumentsDir = '/tmp/foliole-node-sync-versions-documents';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabase } from './migrate.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { flushNodeSyncVersion } from './nodeSyncVersions.js';
import { upsertNodeSnapshot } from './nodeMutations.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-sync-versions-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('creates a sync version from a dirty node and clears the dirty flag', () => {
  upsertNodeSnapshot({
    nodeId: 'node-1',
    parentNodeId: null,
    kind: 'topic',
    title: 'Node 1',
    isTitleManual: true,
    content: 'Hello world',
    reveal: null,
    anchorLink: null,
    imageRegions: null,
    position: 0,
    createdAt: '2026-04-21T10:00:00.000Z',
    updatedAt: '2026-04-21T10:00:00.000Z'
  });

  const connection = openDatabaseConnection();
  expect(
    connection.driver.queryOne<{ sync_dirty: number; current_version_id: string | null }>(
      'SELECT sync_dirty, current_version_id FROM nodes WHERE id = ?',
      ['node-1']
    )
  ).toEqual({
    current_version_id: null,
    sync_dirty: 1
  });

  const versionId = flushNodeSyncVersion('node-1', '2026-04-21T10:01:00.000Z');

  expect(versionId).toMatch(/^desktop-.*#0$/);
  expect(
    connection.driver.queryOne<{ sync_dirty: number; current_version_id: string | null; last_modified_by_device_id: string | null }>(
      'SELECT sync_dirty, current_version_id, last_modified_by_device_id FROM nodes WHERE id = ?',
      ['node-1']
    )
  ).toEqual({
    current_version_id: versionId,
    last_modified_by_device_id: expect.stringMatching(/^desktop-/),
    sync_dirty: 0
  });
  expect(
    connection.driver.queryOne<{ object_id: string; parent_version_id: string | null; version_id: string }>(
      'SELECT object_id, parent_version_id, version_id FROM node_sync_versions WHERE version_id = ?',
      [versionId ?? '']
    )
  ).toEqual({
    object_id: 'node-1',
    parent_version_id: null,
    version_id: versionId
  });
});
