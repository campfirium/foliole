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
  restoreNodes,
  softDeleteNodes,
  upsertNodeSnapshot
} from './nodeMutations.js';
import { applyReviewGrade } from './reviewMutations.js';

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

function seedNode(nodeId: string, parentNodeId: string | null, position: number) {
  upsertNodeSnapshot({
    nodeId,
    parentNodeId,
    kind: nodeId === 'node-child' ? 'item' : 'topic',
    title: nodeId,
    isTitleManual: true,
    content: `# ${nodeId}`,
    reveal: nodeId === 'node-child' ? 'answer' : null,
    anchorLink: null,
    position,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:00.000Z'
  });
}

function getNodeRow(nodeId: string) {
  const connection = openDatabaseConnection();
  return connection.sqlite.prepare('SELECT id, parent_id, content, deleted_at, virtual_filter FROM nodes WHERE id = ?').get(nodeId) as
    | { content: string; id: string; parent_id: string | null; deleted_at: string | null; virtual_filter: string | null }
    | undefined;
}

function getNodeOrderRows() {
  const connection = openDatabaseConnection();
  return connection.sqlite
    .prepare('SELECT node_id, position FROM node_order ORDER BY position ASC')
    .all() as Array<{ node_id: string; position: number }>;
}

function getReviewCounts(nodeId: string) {
  const connection = openDatabaseConnection();
  const reviewCount = connection.sqlite
    .prepare('SELECT COUNT(*) as count FROM node_review WHERE node_id = ?')
    .get(nodeId) as { count: number };
  const reviewLogCount = connection.sqlite
    .prepare('SELECT COUNT(*) as count FROM review_log WHERE node_id = ?')
    .get(nodeId) as { count: number };
  return {
    reviewCount: reviewCount.count,
    reviewLogCount: reviewLogCount.count
  };
}

function getNodeReadingRow(nodeId: string) {
  const connection = openDatabaseConnection();
  return connection.sqlite
    .prepare('SELECT node_id, state FROM node_reading WHERE node_id = ?')
    .get(nodeId) as { node_id: string; state: string } | undefined;
}

function seedDismissedReadingNode(nodeId: string, parentNodeId: string | null, position: number) {
  upsertNodeSnapshot({
    nodeId,
    parentNodeId,
    kind: 'item',
    title: nodeId,
    isTitleManual: true,
    content: `# ${nodeId}`,
    reveal: 'answer',
    anchorLink: null,
    reading: {
      intervalDurationMs: 0,
      intervalGrowthFactor: 1,
      lastHandledAt: '2026-03-06T00:00:00.000Z',
      nextAt: '2026-03-06T00:00:00.000Z',
      priority: 0,
      readingPosition: 0,
      repetitionCount: 0,
      state: 'dismissed'
    },
    position,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:00.000Z'
  });
}

function applySeedReviewGrade(nodeId: string) {
  applyReviewGrade({
    nodeId,
    grade: 3,
    reviewedAt: '2026-03-06T00:00:00.000Z',
    cardBefore: {
      due: '2026-03-06T00:00:00.000Z',
      last_review: null,
      state: 0,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0
    },
    cardAfter: {
      due: '2026-03-10T00:00:00.000Z',
      last_review: '2026-03-06T00:00:00.000Z',
      state: 1,
      stability: 2.5,
      difficulty: 3.1,
      elapsed_days: 1,
      scheduled_days: 4,
      reps: 1,
      lapses: 0
    }
  });
}

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

it('deletes subtree nodes and rewrites node_order while clearing review side tables', () => {
  seedNode('node-root', null, 0);
  seedDismissedReadingNode('node-child', 'node-root', 1);
  seedNode('node-keep', null, 2);
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
