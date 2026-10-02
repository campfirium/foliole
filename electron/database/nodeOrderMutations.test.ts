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

import { ROOT_CHILD_ORDER_ID } from '../../lib/core/database/parentChildOrder.js';

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
