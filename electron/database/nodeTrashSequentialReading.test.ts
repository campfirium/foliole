// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: appDataDir, app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'), app_log_dir: path.join(appDataDir, 'logs')
  })
}));
vi.mock('../foliolePublish/foliolePublishManagement.js', () => ({ assertFoliolePublishedDeleteAllowed: vi.fn() }));
vi.mock('../ipc/boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined) }));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { saveNodeReadingState } from './nodeReadingState.js';
import { drainDirtyNodeSyncVersions } from './nodeSyncVersionDrain.js';
import { restoreNodesWithParents, softDeleteNodesWithParents } from './nodeTrashTransitions.js';

const now = '2026-11-21T00:00:00.000Z';

function seed(nodeId: string, parentNodeId: string | null, kind: 'folder' | 'topic', sequentialReadingEnabled = false) {
  upsertNodeSnapshot({ nodeId, parentNodeId, kind, title: nodeId, isTitleManual: true, content: kind === 'topic' ? `# ${nodeId}` : '',
    reveal: null, review: null, reading: null, anchorLink: null, position: 0, createdAt: now, updatedAt: now,
    ...(sequentialReadingEnabled ? { sequentialReadingEnabled: true } : {}) });
}

function read(nodeId: string, state: 'active' | 'locked') {
  saveNodeReadingState({ nodeId, updatedAt: now, reading: { intervalDurationMs: 0, intervalGrowthFactor: 1,
    lastHandledAt: now, nextAt: now, priority: 0, readingPosition: 0, repetitionCount: 0, state } });
}

function states(ids: string[]) {
  return Object.fromEntries(ids.map(id => [id, (openDatabaseConnection().driver.queryOne<{ state: string }>(
    'SELECT state FROM node_reading WHERE node_id = ?', [id]))?.state ?? null]));
}

beforeEach(async () => {
  appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-trash-reading-'));
  initializeDatabase();
});
afterEach(async () => {
  await drainDirtyNodeSyncVersions();
  closeDatabaseConnection();
  await fs.rm(appDataDir, { recursive: true, force: true });
});

function seedFolderSource() {
  seed('source', null, 'folder', true);
  for (const id of ['a', 'b', 'c']) seed(id, 'source', 'topic');
  openDatabaseConnection().driver.execute('UPDATE nodes SET manual_child_order = ? WHERE id = ?', [JSON.stringify(['a', 'b', 'c']), 'source']);
  read('a', 'active');
  read('b', 'locked');
  read('c', 'locked');
}

it('releases the next topic of a folder source when the active topic moves to Trash and takes it back on restore', () => {
  seedFolderSource();
  expect(softDeleteNodesWithParents({ nodeIds: ['a'], deletedAt: now }).readingNodeIds).toEqual(['b']);
  expect(states(['a', 'b', 'c'])).toEqual({ a: 'active', b: 'active', c: 'locked' });
  expect(restoreNodesWithParents({ nodeIds: ['a'] }).readingNodeIds).toEqual(['b']);
  expect(states(['a', 'b', 'c'])).toEqual({ a: 'active', b: 'locked', c: 'locked' });
});

it('releases the next topic of a topic source when the active topic moves to Trash', () => {
  seed('folder', null, 'folder');
  seed('book', 'folder', 'topic', true);
  for (const id of ['a', 'b']) seed(id, 'book', 'topic');
  read('a', 'active');
  read('b', 'locked');
  expect(softDeleteNodesWithParents({ nodeIds: ['a'], deletedAt: now }).readingNodeIds).toEqual(['b']);
  expect(states(['a', 'b'])).toEqual({ a: 'active', b: 'active' });
});

it('changes no reading state without an enabled source in reach', () => {
  seed('folder', null, 'folder');
  for (const id of ['a', 'b']) seed(id, 'folder', 'topic');
  read('a', 'active');
  read('b', 'locked');
  expect(softDeleteNodesWithParents({ nodeIds: ['a'], deletedAt: now }).readingNodeIds).toEqual([]);
  expect(restoreNodesWithParents({ nodeIds: ['a'] }).readingNodeIds).toBeUndefined();
  expect(states(['a', 'b'])).toEqual({ a: 'active', b: 'locked' });
});
