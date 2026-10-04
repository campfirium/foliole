// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-order-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { restoreSavedParentOrder } from '../../lib/core/database/nodeOrderMutations.js';
import { ROOT_CHILD_ORDER_ID } from '../../lib/core/database/parentChildOrder.js';
import { parentOrderBaselineVersionId } from '../../lib/core/sync/syncParentOrderVersionStore.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { moveNodes, replaceNodeOrder, restoreNodes, softDeleteNodes, upsertNodeSnapshot } from './nodeMutations.js';
import { getNodeRow, seedNode } from './nodeMutations.test.helpers.js';
import { loadWorkspaceListSnapshot } from './workspaceListSnapshot.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-order-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function seedFolderNode(nodeId: string, position: number) {
  upsertNodeSnapshot({
    nodeId,
    parentNodeId: null,
    kind: 'folder',
    title: nodeId,
    isTitleManual: true,
    content: '',
    reveal: null,
    anchorLink: null,
    position,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:00.000Z'
  });
}

function childIds(parentId: string) {
  const row = openDatabaseConnection().sqlite.prepare(
    'SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?'
  ).get(parentId) as { child_ids_json: string } | undefined;
  return row ? (JSON.parse(row.child_ids_json) as string[]).filter((id) => !id.startsWith('special-')) : [];
}

it('reorders only the root sequence without creating article versions', () => {
  seedFolderNode('node-a', 0);
  seedFolderNode('node-b', 1);
  const connection = openDatabaseConnection();
  connection.sqlite
    .prepare('UPDATE nodes SET sync_dirty = 0, last_modified_by_host_name = NULL WHERE id IN (?, ?)')
    .run('node-a', 'node-b');

  replaceNodeOrder(['node-b', 'node-a']);

  expect(childIds(ROOT_CHILD_ORDER_ID)).toEqual(['node-b', 'node-a']);
  const head = connection.sqlite.prepare(`SELECT version.version_id, version.kind,
    version.child_ids_json, version.parent_version_ids_json
    FROM parent_order_heads current JOIN parent_order_versions version
      ON version.version_id = current.version_id WHERE current.parent_id = ?`)
    .get(ROOT_CHILD_ORDER_ID) as { version_id: string; kind: string;
      child_ids_json: string; parent_version_ids_json: string };
  expect(head).toMatchObject({ kind: 'user' });
  expect(JSON.parse(head.child_ids_json)).toContain('node-b');
  const [parentId] = JSON.parse(head.parent_version_ids_json) as string[];
  expect(connection.sqlite.prepare(`SELECT kind FROM parent_order_versions WHERE version_id = ?`)
    .get(parentId)).toMatchObject({ kind: 'membership' });
  expect(
    connection.sqlite
      .prepare('SELECT id, updated_at, sync_dirty FROM nodes WHERE id IN (?, ?) ORDER BY id ASC')
      .all('node-a', 'node-b')
  ).toEqual([
    {
      id: 'node-a',
      sync_dirty: 0,
      updated_at: '2026-03-06T00:00:00.000Z'
    },
    {
      id: 'node-b',
      sync_dirty: 0,
      updated_at: '2026-03-06T00:00:00.000Z'
    }
  ]);
});

it('persists non-folder ids in their direct parent sequence', () => {
  seedFolderNode('folder-a', 0);
  seedNode('node-topic', null, 1);


  replaceNodeOrder(['node-topic', 'folder-a']);

  expect(childIds(ROOT_CHILD_ORDER_ID)).toEqual(['node-topic', 'folder-a']);
});

it('moves parent and order in one sqlite mutation without rewriting content', () => {
  seedFolderNode('folder-a', 0);
  seedNode('node-topic', null, 1);

  const result = moveNodes({
    nodeOrder: ['folder-a', 'node-topic'],
    nodes: [{
      nodeId: 'node-topic',
      parentNodeId: 'folder-a',
      reading: null,
      sequentialReadingEnabled: null,
      updatedAt: '2026-03-06T00:05:00.000Z'
    }]
  });

  expect(result).toEqual({ movedNodeIds: ['node-topic'], nodeOrder: ['folder-a', 'node-topic'] });
  expect(getNodeRow('node-topic')).toMatchObject({
    content: '# node-topic',
    parent_id: 'folder-a'
  });
  expect(openDatabaseConnection().sqlite.prepare('SELECT updated_at FROM nodes WHERE id = ?').get('node-topic')).toEqual({
    updated_at: '2026-03-06T00:05:00.000Z'
  });
  expect(childIds(ROOT_CHILD_ORDER_ID)).toEqual(['folder-a']);
  expect(childIds('folder-a')).toEqual(['node-topic']);
});

it('keeps a trashed child in its parent sequence and restores its current place', () => {
  seedFolderNode('node-a', 0);
  seedFolderNode('node-b', 1);
  seedFolderNode('node-c', 2);
  replaceNodeOrder(['node-a', 'node-b', 'node-c']);

  softDeleteNodes({ nodeIds: ['node-b'], deletedAt: '2026-03-06T00:10:00.000Z' });
  replaceNodeOrder(['node-c', 'node-a']);
  expect(childIds(ROOT_CHILD_ORDER_ID)).toEqual(['node-c', 'node-b', 'node-a']);
  expect(loadWorkspaceListSnapshot()?.nodeOrder).not.toContain('node-b');

  restoreNodes({ nodeIds: ['node-b'] });
  expect(loadWorkspaceListSnapshot()?.nodeOrder.filter((id) => id.startsWith('node-')))
    .toEqual(['node-c', 'node-b', 'node-a']);
});

it('starts a truthful baseline when a legacy receive replaced the local order', () => {
  seedFolderNode('node-a', 0);
  seedFolderNode('node-b', 1);
  seedFolderNode('node-c', 2);
  const db = openDatabaseConnection().sqlite;
  replaceNodeOrder(['node-b', 'node-a', 'node-c']);
  const oldHead = db.prepare('SELECT version_id FROM parent_order_heads WHERE parent_id = ?')
    .pluck().get(ROOT_CHILD_ORDER_ID);
  const incoming = ['node-c', 'node-b', 'node-a'];
  db.prepare('UPDATE parent_child_order SET child_ids_json = ? WHERE parent_id = ?')
    .run(JSON.stringify(incoming), ROOT_CHILD_ORDER_ID);
  replaceNodeOrder(['node-a', 'node-c', 'node-b']);
  const head = db.prepare(`SELECT version.parent_version_ids_json FROM parent_order_heads current
    JOIN parent_order_versions version ON version.version_id = current.version_id
    WHERE current.parent_id = ?`).get(ROOT_CHILD_ORDER_ID) as
    { parent_version_ids_json: string };
  expect(JSON.parse(head.parent_version_ids_json)).toEqual([
    parentOrderBaselineVersionId(ROOT_CHILD_ORDER_ID, incoming)
  ]);
  expect(JSON.parse(head.parent_version_ids_json)).not.toContain(oldHead);
});

it('restores a saved order as a new version while preserving later additions', () => {
  seedFolderNode('node-a', 0);
  seedFolderNode('node-b', 1);
  seedFolderNode('node-c', 2);
  replaceNodeOrder(['node-b', 'node-a', 'node-c']);
  const connection = openDatabaseConnection();
  const savedId = connection.sqlite.prepare('SELECT version_id FROM parent_order_heads WHERE parent_id = ?')
    .pluck().get(ROOT_CHILD_ORDER_ID) as string;
  replaceNodeOrder(['node-a', 'node-b', 'node-c']);
  seedFolderNode('node-d', 3);
  expect(restoreSavedParentOrder(connection.driver, { parentId: ROOT_CHILD_ORDER_ID,
    versionId: savedId, hostName: 'test', updatedAt: '2026-03-07T00:00:00.000Z' })).toBe(true);
  expect(childIds(ROOT_CHILD_ORDER_ID)).toEqual(['node-b', 'node-a', 'node-c', 'node-d']);
  const restoredHead = connection.sqlite.prepare('SELECT version_id FROM parent_order_heads WHERE parent_id = ?')
    .pluck().get(ROOT_CHILD_ORDER_ID);
  expect(restoredHead).not.toBe(savedId);
  expect(connection.sqlite.prepare(`SELECT kind, parent_version_ids_json FROM parent_order_versions
    WHERE version_id = ?`).get(restoredHead)).toMatchObject({ kind: 'user' });
});

it('does not revive deleted or moved children from a saved arrangement', () => {
  seedFolderNode('folder-a', 0);
  seedFolderNode('node-a', 1);
  seedFolderNode('node-b', 2);
  seedFolderNode('node-c', 3);
  replaceNodeOrder(['node-b', 'node-a', 'node-c', 'folder-a']);
  const connection = openDatabaseConnection();
  const savedId = connection.sqlite.prepare('SELECT version_id FROM parent_order_heads WHERE parent_id = ?')
    .pluck().get(ROOT_CHILD_ORDER_ID) as string;
  softDeleteNodes({ nodeIds: ['node-b'], deletedAt: '2026-03-07T00:00:00.000Z' });
  moveNodes({ nodeOrder: ['node-a', 'folder-a', 'node-c'], nodes: [{
    nodeId: 'node-c', parentNodeId: 'folder-a', reading: null,
    sequentialReadingEnabled: null, updatedAt: '2026-03-07T00:01:00.000Z'
  }] });
  seedFolderNode('node-d', 4);
  expect(restoreSavedParentOrder(connection.driver, { parentId: ROOT_CHILD_ORDER_ID,
    versionId: savedId, hostName: 'test', updatedAt: '2026-03-07T00:02:00.000Z' })).toBe(true);
  const root = childIds(ROOT_CHILD_ORDER_ID);
  expect(root).toContain('node-a');
  expect(root).toContain('node-d');
  expect(root).not.toContain('node-b');
  expect(root).not.toContain('node-c');
  expect(childIds('folder-a')).toContain('node-c');
});
