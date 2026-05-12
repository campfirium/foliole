// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-sync-versions-order-tests';
let mockedDocumentsDir = '/tmp/foliole-node-sync-versions-order-documents';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { replaceNodeOrder, upsertNodeSnapshot } from './nodeMutations.js';
import { flushDirtyNodeSyncVersions, flushNodeSyncVersion } from './nodeSyncVersions.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-sync-versions-order-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function upsertTestNode(nodeId: string, position: number) {
  upsertNodeSnapshot({
    nodeId,
    parentNodeId: null,
    kind: 'folder',
    title: nodeId,
    isTitleManual: true,
    content: `Content ${nodeId}`,
    reveal: null,
    anchorLink: null,
    imageRegions: null,
    position,
    createdAt: '2026-04-21T10:00:00.000Z',
    updatedAt: '2026-04-21T10:00:00.000Z'
  });
}

function readNodeVersion(versionId: string) {
  return openDatabaseConnection().driver.queryOne<{
    content_hash: string;
    snapshot_json: string;
    version_id: string;
  }>(
    'SELECT version_id, content_hash, snapshot_json FROM node_sync_versions WHERE version_id = ?',
    [versionId]
  );
}

it('creates a position-only sync version without advancing updated_at', () => {
  upsertTestNode('node-1', 0);
  upsertTestNode('node-2', 1);
  const initialVersionId = flushNodeSyncVersion('node-1', '2026-04-21T10:01:00.000Z') ?? '';
  const initialVersion = readNodeVersion(initialVersionId);

  replaceNodeOrder(['node-2', 'node-1']);
  expect(flushDirtyNodeSyncVersions('2026-04-21T10:02:00.000Z')).toContain('node-1');

  const current = openDatabaseConnection().driver.queryOne<{
    content_hash: string;
    current_version_id: string;
    updated_at: string;
  }>(
    `SELECT state.content_hash, state.current_version_id, state.updated_at
     FROM sync_object_state state
     WHERE state.object_type = 'node' AND state.object_id = 'node-1'`
  );
  const nextVersion = readNodeVersion(current?.current_version_id ?? '');
  const snapshot = JSON.parse(nextVersion?.snapshot_json ?? '{}') as Record<string, unknown>;

  expect(nextVersion?.version_id).not.toBe(initialVersion?.version_id);
  expect(nextVersion?.content_hash).not.toBe(initialVersion?.content_hash);
  expect(snapshot).toMatchObject({
    position: 1,
    updated_at: '2026-04-21T10:00:00.000Z'
  });
  expect(current).toMatchObject({
    content_hash: nextVersion?.content_hash,
    updated_at: '2026-04-21T10:00:00.000Z'
  });
});
