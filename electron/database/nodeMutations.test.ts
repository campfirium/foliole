// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-mutations-tests';

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
import {
  deleteNodesPermanently,
  replaceNodeOrder,
  restoreNodes,
  softDeleteNodes,
  upsertNodeSnapshot
} from './nodeMutations.js';
import {
  applySeedReviewGrade,
  getContentBlobData,
  getContentBlobRow,
  getNodeOrderRows,
  getNodeReadingRow,
  getNodeRow,
  getReviewCounts,
  seedDismissedReadingNode,
  seedNode
} from './nodeMutations.test.helpers.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-mutation-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('marks and restores deleted_at through transactional node trash mutations', () => {
  seedNode('node-root', null, 0);
  seedNode('node-child', 'node-root', 1);

  softDeleteNodes({
    nodeIds: ['node-root', 'node-child'],
    deletedAt: '2026-03-06T00:10:00.000Z'
  });

  expect(getNodeRow('node-root')?.deleted_at).toBe('2026-03-06T00:10:00.000Z');
  expect(getNodeRow('node-child')?.deleted_at).toBe('2026-03-06T00:10:00.000Z');

  restoreNodes({ nodeIds: ['node-root', 'node-child'] });

  expect(getNodeRow('node-root')?.deleted_at).toBeNull();
  expect(getNodeRow('node-child')?.deleted_at).toBeNull();
});

it('writes node body blob metadata when storing node content', () => {
  seedNode('node-root', null, 0);

  const row = getNodeRow('node-root');

  expect(row?.body_blob_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(getContentBlobRow(row?.body_blob_hash ?? '')).toEqual({
    availability: 'local',
    hash: row?.body_blob_hash,
    kind: 'text_body',
    mime_type: 'text/plain'
  });
  expect(Buffer.from(getContentBlobData(row?.body_blob_hash ?? '')?.data ?? []).toString('utf8')).toBe('# node-root');
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

it('deletes subtree nodes and rewrites folder node_order while clearing review side tables', () => {
  seedNode('node-root', null, 0);
  seedDismissedReadingNode('node-child', 'node-root', 1);
  seedFolderNode('node-keep', 2);
  applySeedReviewGrade('node-child');

  expect(getReviewCounts('node-child')).toEqual({ reviewCount: 1, reviewLogCount: 1 });
  expect(getNodeReadingRow('node-child')).toEqual({ node_id: 'node-child', state: 'dismissed' });

  deleteNodesPermanently({
    nodeIds: ['node-root', 'node-child'],
    nodeOrder: ['node-keep']
  });

  expect(getNodeRow('node-root')).toBeUndefined();
  expect(getNodeRow('node-child')).toBeUndefined();
  expect(getNodeRow('node-keep')).toBeDefined();
  expect(getNodeOrderRows()).toEqual([{ node_id: 'node-keep', position: 0 }]);
  expect(getReviewCounts('node-child')).toEqual({ reviewCount: 0, reviewLogCount: 0 });
  expect(getNodeReadingRow('node-child')).toBeUndefined();
});

it('rewrites folder order without changing node updated_at or nodes.position', () => {
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
      last_modified_by_device_id: expect.stringMatching(/^device-/),
      position: null,
      sync_dirty: 1,
      updated_at: '2026-03-06T00:00:00.000Z'
    },
    {
      id: 'node-b',
      last_modified_by_device_id: expect.stringMatching(/^device-/),
      position: null,
      sync_dirty: 1,
      updated_at: '2026-03-06T00:00:00.000Z'
    }
  ]);
});

it('filters non-folder ids out of order writes and clears old non-folder rows', () => {
  seedFolderNode('folder-a', 0);
  seedNode('node-topic', null, 1);
  openDatabaseConnection().sqlite
    .prepare('INSERT OR REPLACE INTO node_order (node_id, position) VALUES (?, ?)')
    .run('node-topic', 99);

  replaceNodeOrder(['node-topic', 'folder-a']);

  expect(getNodeOrderRows()).toEqual([{ node_id: 'folder-a', position: 0 }]);
});

it('keeps surviving parent content unchanged when permanently deleting linked child nodes', () => {
  const parentContent = 'before answer after';
  upsertNodeSnapshot({
    nodeId: 'node-parent',
    parentNodeId: null,
    kind: 'topic',
    title: 'node-parent',
    isTitleManual: true,
    content: parentContent,
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'node-child',
    parentNodeId: 'node-parent',
    kind: 'item',
    title: 'node-child',
    isTitleManual: true,
    content: 'before [...] after',
    reveal: 'answer',
    anchorLink: {
      id: '1',
      kind: 'cloze',
      locator: {
        from: parentContent.indexOf('answer'),
        originalText: 'answer',
        to: parentContent.indexOf('answer') + 'answer'.length
      }
    },
    position: 1,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:00.000Z'
  });
  softDeleteNodes({
    nodeIds: ['node-child'],
    deletedAt: '2026-03-06T00:10:00.000Z'
  });

  const affectedParentNodeIds = deleteNodesPermanently({
    nodeIds: ['node-child'],
    nodeOrder: ['node-parent']
  });

  expect(affectedParentNodeIds).toEqual([]);
  expect(getNodeRow('node-parent')?.content).toBe(parentContent);
  expect(getNodeRow('node-child')).toBeUndefined();
});

it('stores virtual filter payload in sqlite node rows', () => {
  upsertNodeSnapshot({
    nodeId: 'node-virtual',
    parentNodeId: 'special-virtual-root',
    kind: 'folder',
    title: 'Saved search',
    isTitleManual: true,
    content: '',
    virtualFilter: {
      version: 1,
      match: 'all',
      conditions: [{ field: 'text', operator: 'contains', value: 'reader' }]
    },
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:00.000Z'
  });

  expect(getNodeRow('node-virtual')?.virtual_filter).toBe(
    '{"version":1,"match":"all","conditions":[{"field":"text","operator":"contains","value":"reader"}]}'
  );
});
