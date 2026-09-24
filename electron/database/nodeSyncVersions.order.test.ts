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
import { moveNodes, replaceNodeOrder, upsertNodeSnapshot, upsertNodeSnapshotWithOrder } from './nodeMutations.js';
import { flushDirtyNodeSyncVersions, flushNodeSyncVersion } from './nodeSyncVersions.js';
import { buildDesktopSyncPack } from './syncPackBuilder.js';
import { readPackRowsFromZip } from './syncPackZipReaderTestSupport.js';

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

it('includes an ordinary order change in the next automatic pack without an editor close', async () => {
  upsertTestNode('node-1', 0);
  upsertTestNode('node-2', 1);
  flushDirtyNodeSyncVersions('2026-04-21T10:01:00.000Z');
  const driver = openDatabaseConnection().driver;
  const previousSeq = driver.queryOne<{ value: number }>(
    'SELECT MAX(state_seq) AS value FROM sync_object_state'
  )!.value;

  replaceNodeOrder(['node-2', 'node-1']);
  const packPath = path.join(tempRoot, 'order.syncpack');
  const pack = await buildDesktopSyncPack({
    createdAt: '2026-04-21T10:02:00.000Z', fromPeerId: 'mac', fromStateSeq: previousSeq,
    outputPath: packPath, packId: 'order-pack', toPeerId: 'windows'
  });
  const rows = readPackRowsFromZip(packPath, tempRoot);

  expect(pack.toStateSeq).toBeGreaterThan(previousSeq);
  expect(rows.manifest.tables).toEqual(expect.arrayContaining([
    { name: 'node_order', row_count: 2 }
  ]));
  const latestPositions = new Map((rows.nodeVersions as Array<{
    object_id: string; snapshot_json: string
  }>).map((row) => [
    row.object_id, JSON.parse(row.snapshot_json) as { position: number }
  ]));
  expect(latestPositions.get('node-1')?.position).toBe(1);
  expect(latestPositions.get('node-2')?.position).toBe(0);
  expect(rows.nodeVersions).toEqual(expect.arrayContaining([
    expect.objectContaining({ object_id: 'node-1' }),
    expect.objectContaining({ object_id: 'node-2' })
  ]));
});

it('versions the shifted sibling when a different node moves', () => {
  upsertTestNode('node-1', 0);
  upsertTestNode('node-2', 1);
  upsertTestNode('node-3', 2);
  flushDirtyNodeSyncVersions('2026-04-21T10:01:00.000Z');
  moveNodes({
    nodeOrder: ['node-2', 'node-1', 'node-3'],
    nodes: [{ nodeId: 'node-1', parentNodeId: null, updatedAt: '2026-04-21T10:02:00.000Z' }]
  });
  expect(openDatabaseConnection().driver.queryOne<{ sync_dirty: number }>(
    'SELECT sync_dirty FROM nodes WHERE id = ?', ['node-2']
  )?.sync_dirty).toBe(1);
});

it('versions existing nodes shifted by creating a new node', () => {
  upsertTestNode('node-1', 0);
  upsertTestNode('node-2', 1);
  flushDirtyNodeSyncVersions('2026-04-21T10:01:00.000Z');

  upsertNodeSnapshotWithOrder({
    nodeId: 'node-3', parentNodeId: null, kind: 'folder', title: 'node-3',
    isTitleManual: true, content: '', reveal: null, anchorLink: null,
    imageRegions: null, position: 0,
    createdAt: '2026-04-21T10:02:00.000Z', updatedAt: '2026-04-21T10:02:00.000Z'
  }, ['node-3', 'node-1', 'node-2']);

  const driver = openDatabaseConnection().driver;
  expect(driver.queryAll<{ id: string }>(
    `SELECT id FROM nodes WHERE sync_dirty = 1 AND id IN ('node-1', 'node-2') ORDER BY id`
  ).map((row) => row.id)).toEqual(['node-1', 'node-2']);
});

it('includes an existing unversioned position change in the next automatic pack', async () => {
  upsertTestNode('node-1', 0);
  flushDirtyNodeSyncVersions('2026-04-21T10:01:00.000Z');
  const driver = openDatabaseConnection().driver;
  const previousSeq = driver.queryOne<{ value: number }>(
    'SELECT MAX(state_seq) AS value FROM sync_object_state'
  )!.value;
  driver.execute('UPDATE node_order SET position = 7 WHERE node_id = ?', ['node-1']);

  const packPath = path.join(tempRoot, 'stale-order.syncpack');
  const pack = await buildDesktopSyncPack({
    createdAt: '2026-04-21T10:02:00.000Z', fromPeerId: 'mac', fromStateSeq: previousSeq,
    outputPath: packPath, packId: 'stale-order-pack', toPeerId: 'windows'
  });
  const rows = readPackRowsFromZip(packPath, tempRoot);
  expect(pack.toStateSeq).toBeGreaterThan(previousSeq);
  expect((rows.nodeVersions as Array<{ object_id: string; snapshot_json: string }>).some(
    (row) => row.object_id === 'node-1' && JSON.parse(row.snapshot_json).position === 7
  )).toBe(true);
});
