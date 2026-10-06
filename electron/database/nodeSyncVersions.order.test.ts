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

it('keeps an article version unchanged after a pure reorder', () => {
  upsertTestNode('node-1', 0);
  upsertTestNode('node-2', 1);
  const initialVersionId = flushNodeSyncVersion('node-1', '2026-04-21T10:01:00.000Z') ?? '';
  const initialVersion = readNodeVersion(initialVersionId);

  replaceNodeOrder(['node-2', 'node-1']);
  expect(flushDirtyNodeSyncVersions('2026-04-21T10:02:00.000Z')).not.toContain('node-1');

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

  expect(nextVersion?.version_id).toBe(initialVersion?.version_id);
  expect(nextVersion?.content_hash).toBe(initialVersion?.content_hash);
  expect(snapshot).not.toHaveProperty('position');
  expect(current).toMatchObject({
    content_hash: nextVersion?.content_hash,
    updated_at: '2026-04-21T10:00:00.000Z'
  });
});

it('packs an ordinary order change as one parent object without article rows', async () => {
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
  expect(rows.nodes).toEqual([]);
  expect(rows.nodeVersions).toEqual([]);
  expect(rows.syncObjects).toEqual([
    expect.objectContaining({ object_type: 'order_version', payload_json: expect.stringContaining('node-2') }),
    expect.objectContaining({ object_type: 'parent_child_order', payload_json: expect.stringContaining('node-2') })
  ]);
});

it('leaves a shifted sibling clean when a different node moves', () => {
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
  )?.sync_dirty).toBe(0);
});

it('leaves existing siblings clean when creating a new node', () => {
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
  ).map((row) => row.id)).toEqual([]);
});

it('ignores obsolete ranking rows in the next automatic pack', async () => {
  upsertTestNode('node-1', 0);
  flushDirtyNodeSyncVersions('2026-04-21T10:01:00.000Z');
  const driver = openDatabaseConnection().driver;
  const previousSeq = driver.queryOne<{ value: number }>(
    'SELECT MAX(state_seq) AS value FROM sync_object_state'
  )!.value;
  openDatabaseConnection().sqlite.exec('CREATE TABLE IF NOT EXISTS node_order (node_id TEXT PRIMARY KEY, position INTEGER NOT NULL);');
  driver.execute('INSERT INTO node_order (node_id, position) VALUES (?, ?)', ['node-1', 7]);

  const packPath = path.join(tempRoot, 'stale-order.syncpack');
  const pack = await buildDesktopSyncPack({
    createdAt: '2026-04-21T10:02:00.000Z', fromPeerId: 'mac', fromStateSeq: previousSeq,
    outputPath: packPath, packId: 'stale-order-pack', toPeerId: 'windows'
  });
  const rows = readPackRowsFromZip(packPath, tempRoot);
  expect(pack.toStateSeq).toBe(previousSeq);
  expect(rows.nodeVersions).toEqual([]);
});
