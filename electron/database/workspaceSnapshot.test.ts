// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-workspace-snapshot-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { softDeleteNodes, upsertNodeSnapshot } from './nodeMutations.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-snapshot-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function seedNode(nodeId: string, position: number) {
  upsertNodeSnapshot({
    nodeId,
    parentNodeId: null,
    kind: 'topic',
    title: `title:${nodeId}`,
    isTitleManual: true,
    content: `content:${nodeId}`,
    reveal: null,
    anchorLink: null,
    position,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:00.000Z'
  });
}

it('returns null when sqlite has no workspace node rows', () => {
  expect(loadWorkspaceSnapshot()).toBeNull();
});

it('loads workspace snapshot from sqlite without localStorage dependency', () => {
  seedNode('node-1', 0);
  seedNode('node-2', 1);
  softDeleteNodes({
    nodeIds: ['node-1'],
    deletedAt: '2026-03-06T00:10:00.000Z'
  });

  const snapshot = loadWorkspaceSnapshot();

  expect(snapshot).not.toBeNull();
  expect(snapshot?.nodeOrder).toEqual(['node-1', 'node-2']);
  expect(snapshot?.trashedNodeIds).toEqual(['node-1']);
  expect(snapshot?.activeNodeId).toBe('node-2');
  expect(snapshot?.nodesById['node-2']?.content).toBe('content:node-2');
  expect(snapshot?.untitledSequenceByParent).toEqual({});
});

it('loads persisted reading profiles from sqlite snapshot', () => {
  upsertNodeSnapshot({
    nodeId: 'node-reading',
    parentNodeId: null,
    kind: 'topic',
    title: 'Reading node',
    isTitleManual: true,
    content: 'content:reading',
    reveal: null,
    anchorLink: null,
    reading: {
      intervalDurationMs: 0,
      intervalGrowthFactor: 1,
      lastHandledAt: '2026-03-18T00:00:00.000Z',
      nextAt: '2026-03-18T00:00:00.000Z',
      priority: 0,
      readingPosition: 0,
      repetitionCount: 0,
      state: 'dismissed'
    },
    position: 0,
    createdAt: '2026-03-18T00:00:00.000Z',
    updatedAt: '2026-03-18T00:00:00.000Z'
  });

  const snapshot = loadWorkspaceSnapshot();

  expect(snapshot?.nodesById['node-reading']?.reading).toEqual({
    intervalDurationMs: 0,
    intervalGrowthFactor: 1,
    lastHandledAt: '2026-03-18T00:00:00.000Z',
    nextAt: '2026-03-18T00:00:00.000Z',
    priority: 0,
    readingPosition: 0,
    repetitionCount: 0,
    state: 'dismissed'
  });
  expect(snapshot?.untitledSequenceByParent).toEqual({});
});

it('loads persisted virtual filter config from sqlite snapshot', () => {
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
    createdAt: '2026-03-18T00:00:00.000Z',
    updatedAt: '2026-03-18T00:00:00.000Z'
  });

  const snapshot = loadWorkspaceSnapshot();

  expect(snapshot?.nodesById['node-virtual']?.virtualFilter).toEqual({
    version: 1,
    match: 'all',
    conditions: [{ field: 'text', operator: 'contains', value: 'reader' }]
  });
});

it('loads persisted Untitled sequence state from sqlite snapshot', () => {
  upsertNodeSnapshot({
    nodeId: 'node-untitled',
    parentNodeId: null,
    kind: 'topic',
    title: 'Untitled 6',
    isTitleManual: false,
    content: '',
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-03-18T00:00:00.000Z',
    updatedAt: '2026-03-18T00:00:00.000Z'
  });

  const snapshot = loadWorkspaceSnapshot();

  expect(snapshot?.untitledSequenceByParent).toEqual({
    __root__: 7
  });
});

it('preserves text anchor locators after sqlite reload', () => {
  seedNode('node-parent', 0);
  upsertNodeSnapshot({
    nodeId: 'node-highlight',
    parentNodeId: 'node-parent',
    kind: 'topic',
    title: 'Selected text',
    isTitleManual: true,
    content: 'Alpha',
    reveal: null,
    anchorLink: {
      id: 'anchor-1',
      kind: 'highlight',
      locator: {
        from: 3,
        to: 8,
        originalText: 'Alpha'
      }
    },
    position: 1,
    createdAt: '2026-03-18T00:00:00.000Z',
    updatedAt: '2026-03-18T00:00:00.000Z'
  });

  const snapshot = loadWorkspaceSnapshot();

  expect(snapshot?.nodesById['node-highlight']?.anchorLink).toEqual({
    id: 'anchor-1',
    kind: 'highlight',
    locator: {
      from: 3,
      to: 8,
      originalText: 'Alpha'
    }
  });
});
