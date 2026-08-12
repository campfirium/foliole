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

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { moveNodes, replaceNodeOrder, upsertNodeSnapshot } from './nodeMutations.js';
import { getNodeOrderRows, getNodeRow, seedNode } from './nodeMutations.test.helpers.js';

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

it('rewrites node order without changing node updated_at or nodes.position', () => {
  seedFolderNode('node-a', 0);
  seedFolderNode('node-b', 1);
  const connection = openDatabaseConnection();
  connection.sqlite
    .prepare('UPDATE nodes SET sync_dirty = 0, last_modified_by_device_id = NULL WHERE id IN (?, ?)')
    .run('node-a', 'node-b');

  replaceNodeOrder(['node-b', 'node-a']);

  expect(getNodeOrderRows()).toEqual([
    { node_id: 'node-b', position: 0 },
    { node_id: 'node-a', position: 1 }
  ]);
  expect(
    connection.sqlite
      .prepare(
        `SELECT id, position, updated_at, sync_dirty, last_modified_by_device_id
         FROM nodes
         WHERE id IN (?, ?)
         ORDER BY id ASC`
      )
      .all('node-a', 'node-b')
  ).toEqual([
    {
      id: 'node-a',
      last_modified_by_device_id: expect.any(String),
      position: null,
      sync_dirty: 1,
      updated_at: '2026-03-06T00:00:00.000Z'
    },
    {
      id: 'node-b',
      last_modified_by_device_id: expect.any(String),
      position: null,
      sync_dirty: 1,
      updated_at: '2026-03-06T00:00:00.000Z'
    }
  ]);
});

it('persists non-folder ids in order writes', () => {
  seedFolderNode('folder-a', 0);
  seedNode('node-topic', null, 1);
  openDatabaseConnection().sqlite
    .prepare('INSERT OR REPLACE INTO node_order (node_id, position) VALUES (?, ?)')
    .run('node-topic', 99);

  replaceNodeOrder(['node-topic', 'folder-a']);

  expect(getNodeOrderRows()).toEqual([
    { node_id: 'node-topic', position: 0 },
    { node_id: 'folder-a', position: 1 }
  ]);
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
  expect(getNodeOrderRows()).toEqual([
    { node_id: 'folder-a', position: 0 },
    { node_id: 'node-topic', position: 1 }
  ]);
});
