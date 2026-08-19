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

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { softDeleteNodes, upsertNodeSnapshot } from './nodeMutations.js';
import { flushDirtyNodeSyncVersions, flushNodeSyncVersion } from './nodeSyncVersions.js';

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

function upsertTestNode() {
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
}

function assertNodeSyncState(versionId: string | null) {
  const connection = openDatabaseConnection();
  expect(
    connection.driver.queryOne<{
      content_hash: string;
      current_version_id: string | null;
      object_id: string;
      object_type: string;
      sync_dirty: number;
    }>(
      'SELECT object_type, object_id, current_version_id, content_hash, sync_dirty FROM sync_object_state WHERE object_type = ? AND object_id = ?',
      ['node', 'node-1']
    )
  ).toEqual({
    content_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    current_version_id: versionId,
    object_id: 'node-1',
    object_type: 'node',
    sync_dirty: 0
  });
}

it('creates a sync version from a dirty node and clears the dirty flag', () => {
  upsertTestNode();

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

  expect(versionId).toMatch(/^ver_[0-9a-f-]{36}$/);
  expect(
    connection.driver.queryOne<{ sync_dirty: number; current_version_id: string | null; last_modified_by_device_id: string | null }>(
      'SELECT sync_dirty, current_version_id, last_modified_by_device_id FROM nodes WHERE id = ?',
      ['node-1']
    )
  ).toEqual({
    current_version_id: versionId,
    last_modified_by_device_id: expect.any(String),
    sync_dirty: 0
  });
  const versionRow = connection.driver.queryOne<{
    object_id: string;
    parent_version_id: string | null;
    snapshot_json: string | null;
    version_id: string;
  }>(
      'SELECT object_id, parent_version_id, snapshot_json, version_id FROM node_sync_versions WHERE version_id = ?',
      [versionId ?? '']
    );
  expect(versionRow).toEqual({
    object_id: 'node-1',
    parent_version_id: null,
    snapshot_json: expect.stringContaining('"title":"Node 1"'),
    version_id: versionId
  });
  const snapshot = JSON.parse(versionRow?.snapshot_json ?? '{}') as Record<string, unknown>;
  expect(snapshot.content).toBe('');
  expect(snapshot.body_blob_hash).toMatch(/^[a-f0-9]{64}$/);
  assertNodeSyncState(versionId);
});

it('creates an initial sync version for an unversioned clean node', () => {
  upsertTestNode();

  const connection = openDatabaseConnection();
  connection.driver.execute('UPDATE nodes SET sync_dirty = 0 WHERE id = ?', ['node-1']);

  expect(flushDirtyNodeSyncVersions('2026-04-21T10:01:00.000Z')).toContain('node-1');
  expect(
    connection.driver.queryOne<{ current_version_id: string | null; sync_dirty: number }>(
      'SELECT current_version_id, sync_dirty FROM nodes WHERE id = ?',
      ['node-1']
    )
  ).toEqual({
    current_version_id: expect.stringMatching(/^ver_[0-9a-f-]{36}$/),
    sync_dirty: 0
  });
  expect(
    connection.driver.queryOne<{ object_id: string }>(
      'SELECT object_id FROM sync_object_state WHERE object_type = ? AND object_id = ?',
      ['node', 'node-1']
    )
  ).toEqual({ object_id: 'node-1' });
});

it('keeps fixed system roots outside user node version history', () => {
  upsertTestNode();

  expect(flushDirtyNodeSyncVersions('2026-04-21T10:01:00.000Z')).not.toContain('special-inbox');
  expect(openDatabaseConnection().driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM node_sync_versions WHERE object_id IN ('special-inbox', 'special-virtual-root')"
  )).toEqual({ count: 0 });
});

it('uses node_order as the sync snapshot position source', () => {
  upsertTestNode();
  const connection = openDatabaseConnection();
  connection.driver.execute('UPDATE nodes SET kind = ?, position = NULL WHERE id = ?', ['folder', 'node-1']);
  connection.driver.execute(
    `INSERT INTO node_order (node_id, position) VALUES (?, ?)
     ON CONFLICT(node_id) DO UPDATE SET position = excluded.position`,
    ['node-1', 9]
  );

  const versionId = flushNodeSyncVersion('node-1', '2026-04-21T10:01:00.000Z');
  const row = connection.driver.queryOne<{ snapshot_json: string }>(
    'SELECT snapshot_json FROM node_sync_versions WHERE version_id = ?',
    [versionId ?? '']
  );

  expect(JSON.parse(row?.snapshot_json ?? '{}')).toMatchObject({ position: 9 });
});

it('backfills sync state for already versioned nodes missing from sync_object_state', () => {
  upsertTestNode();
  const connection = openDatabaseConnection();
  const versionId = flushNodeSyncVersion('node-1', '2026-04-21T10:01:00.000Z');
  connection.driver.execute('DELETE FROM sync_object_state WHERE object_type = ? AND object_id = ?', ['node', 'node-1']);

  expect(flushDirtyNodeSyncVersions('2026-04-21T10:02:00.000Z')).toContain('node-1');

  expect(
    connection.driver.queryOne<{ current_version_id: string | null; object_id: string }>(
      'SELECT object_id, current_version_id FROM sync_object_state WHERE object_type = ? AND object_id = ?',
      ['node', 'node-1']
    )
  ).toEqual({ current_version_id: versionId, object_id: 'node-1' });
});

it('creates a tombstone sync version when soft deleting a versioned node', () => {
  upsertTestNode();
  const activeVersionId = flushNodeSyncVersion('node-1', '2026-04-21T10:01:00.000Z');

  softDeleteNodes({ nodeIds: ['node-1'], deletedAt: '2026-04-21T10:02:00.000Z' });

  const connection = openDatabaseConnection();
  const node = connection.driver.queryOne<{ current_version_id: string; deleted_at: string | null; sync_dirty: number }>(
    'SELECT current_version_id, deleted_at, sync_dirty FROM nodes WHERE id = ?',
    ['node-1']
  );
  expect(node).toEqual({
    current_version_id: expect.stringMatching(/^ver_[0-9a-f-]{36}$/),
    deleted_at: '2026-04-21T10:02:00.000Z',
    sync_dirty: 0
  });
  const tombstone = connection.driver.queryOne<{ parent_version_id: string | null; snapshot_json: string }>(
    'SELECT parent_version_id, snapshot_json FROM node_sync_versions WHERE version_id = ?',
    [node?.current_version_id ?? '']
  );
  expect(tombstone?.parent_version_id).toBe(activeVersionId);
  expect(JSON.parse(tombstone?.snapshot_json ?? '{}')).toMatchObject({
    deleted_at: '2026-04-21T10:02:00.000Z',
    id: 'node-1'
  });
  expect(
    connection.driver.queryOne<{ current_version_id: string; deleted_at: string | null }>(
      'SELECT current_version_id, deleted_at FROM sync_object_state WHERE object_type = ? AND object_id = ?',
      ['node', 'node-1']
    )
  ).toEqual({
    current_version_id: node?.current_version_id,
    deleted_at: '2026-04-21T10:02:00.000Z'
  });
});

it('creates an active head before tombstone when soft deleting an unversioned node', () => {
  upsertTestNode();

  softDeleteNodes({ nodeIds: ['node-1'], deletedAt: '2026-04-21T10:02:00.000Z' });

  const connection = openDatabaseConnection();
  const versions = connection.driver.queryAll<{
    parent_version_id: string | null;
    snapshot_json: string;
    version_id: string;
  }>(
    `SELECT version_id, parent_version_id, snapshot_json FROM node_sync_versions WHERE object_id = ?
     ORDER BY parent_version_id IS NOT NULL ASC`,
    ['node-1']
  );
  expect(versions).toHaveLength(2);
  const [createdVersion, deletedVersion] = versions;
  expect(JSON.parse(createdVersion?.snapshot_json ?? '{}')).toMatchObject({ deleted_at: null, id: 'node-1' });
  expect(deletedVersion?.parent_version_id).toBe(createdVersion?.version_id);
  expect(JSON.parse(deletedVersion?.snapshot_json ?? '{}')).toMatchObject({
    deleted_at: '2026-04-21T10:02:00.000Z',
    id: 'node-1'
  });
});
