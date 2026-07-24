// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-mutations-tests';
const publishGuardMocks = vi.hoisted(() => ({ assertFoliolePublishedDeleteAllowed: vi.fn() }));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../foliolePublish/foliolePublishManagement.js', () => publishGuardMocks);

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import {
  deleteNodesPermanently,
  restoreNodes,
  softDeleteNodes,
  upsertNodeSnapshot
} from './nodeMutations.js';
import {
  applySeedReviewGrade,
  getContentBlobData,
  getContentBlobRow,
  getNodeReadingRow,
  getNodeRow,
  getReviewCounts,
  seedDismissedReadingNode,
  seedNode
} from './nodeMutations.test.helpers.js';
import { flushNodeSyncVersion } from './nodeSyncVersions.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-mutation-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  publishGuardMocks.assertFoliolePublishedDeleteAllowed.mockReset();
});

it('blocks both Trash and permanent deletion before mutating a published Topic', () => {
  seedNode('node-root', null, 0);
  publishGuardMocks.assertFoliolePublishedDeleteAllowed.mockImplementation(() => {
    throw new Error('Unpublish first.');
  });

  expect(() => softDeleteNodes({
    nodeIds: ['node-root'], deletedAt: '2026-03-06T00:10:00.000Z'
  })).toThrow('Unpublish first.');
  expect(() => deleteNodesPermanently({ nodeIds: ['node-root'], nodeOrder: [] })).toThrow('Unpublish first.');
  expect(getNodeRow('node-root')?.deleted_at).toBeNull();
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

it('deletes subtree nodes and rewrites node_order while clearing review side tables', () => {
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
  expect(getReviewCounts('node-child')).toEqual({ reviewCount: 0, reviewLogCount: 0 });
  expect(getNodeReadingRow('node-child')).toBeUndefined();
});

it('keeps a permanent-delete tombstone for an already versioned live node', () => {
  seedNode('node-root', null, 0);
  const activeVersionId = flushNodeSyncVersion('node-root', '2026-03-06T00:01:00.000Z');

  deleteNodesPermanently({
    nodeIds: ['node-root'],
    nodeOrder: []
  });

  const connection = openDatabaseConnection();
  const tombstone = connection.sqlite.prepare(
    `SELECT version_id, parent_version_id, snapshot_json, deleted_at, created_at
     FROM node_sync_tombstones WHERE node_id = ?`
  ).get('node-root') as {
    created_at: string;
    deleted_at: string;
    parent_version_id: string | null;
    snapshot_json: string;
    version_id: string;
  };
  expect(tombstone.version_id).not.toBe(activeVersionId);
  expect(tombstone.parent_version_id).toBe(activeVersionId);
  expect(tombstone.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(tombstone.deleted_at).toBe(tombstone.created_at);
  expect(JSON.parse(tombstone.snapshot_json)).toMatchObject({
    deleted_at: tombstone.created_at,
    id: 'node-root',
    updated_at: tombstone.created_at
  });
  expect(connection.sqlite.prepare('SELECT id FROM nodes WHERE id = ?').get('node-root')).toBeUndefined();
  expect(connection.sqlite.prepare(
    `SELECT current_version_id, deleted_at FROM sync_object_state
     WHERE object_type = 'node' AND object_id = ?`
  ).get('node-root')).toEqual({
    current_version_id: tombstone.version_id,
    deleted_at: tombstone.created_at
  });
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
