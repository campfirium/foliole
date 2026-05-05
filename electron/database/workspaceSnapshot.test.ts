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

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { softDeleteNodes, upsertNodeSnapshot } from './nodeMutations.js';
import { loadWorkspaceSnapshot, loadWorkspaceVersionMetadata } from './workspaceSnapshot.js';

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

it('seeds the initial workspace when sqlite starts empty', () => {
  const snapshot = loadWorkspaceSnapshot();

  expect(snapshot).not.toBeNull();
  expect(snapshot?.activeNodeId).toBe('starter-welcome');
  expect(snapshot?.nodeOrder).toEqual([
    'special-inbox',
    'starter-root-folder',
    'special-virtual-root',
    'starter-virtual-example',
    'starter-welcome'
  ]);
  expect(snapshot?.nodesById['special-inbox']?.title).toBe('Inbox');
  expect(snapshot?.nodesById['starter-root-folder']?.parentNodeId).toBeNull();
  expect(snapshot?.nodesById['starter-root-folder']?.title).toBe('Untitled Folder');
  expect(snapshot?.nodesById['special-virtual-root']?.parentNodeId).toBeNull();
  expect(snapshot?.nodesById['special-virtual-root']?.title).toBe('Virtual');
  expect(snapshot?.nodesById['starter-virtual-example']?.parentNodeId).toBe('special-virtual-root');
  expect(snapshot?.nodesById['starter-virtual-example']?.title).toBe('Example');
  expect(snapshot?.nodesById['starter-welcome']?.parentNodeId).toBe('special-inbox');
  expect(snapshot?.nodesById['starter-welcome']?.title).toBe('Welcome to Foliole');
  expect(snapshot?.nodesById['starter-welcome']?.content).toContain('# Welcome to Foliole');
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
  expect(snapshot?.nodeOrder).toEqual([
    'special-inbox',
    'node-1',
    'starter-root-folder',
    'node-2',
    'special-virtual-root',
    'starter-virtual-example',
    'starter-welcome'
  ]);
  expect(snapshot?.trashedNodeIds).toEqual(['node-1']);
  expect(snapshot?.activeNodeId).toBe('starter-welcome');
  expect(snapshot?.nodesById['node-2']?.content).toBe('content:node-2');
  expect(snapshot?.untitledSequenceByParent).toEqual({});
});

it('includes node attachment references in the workspace snapshot', () => {
  seedNode('node-pdf', 0);
  const database = openDatabaseConnection().sqlite;
  database
    .prepare(`INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run('pdf-attachment-1', 'Paper.pdf', 'application/pdf', 128, '2026-04-27T08:00:00.000Z');
  database
    .prepare(`INSERT INTO node_attachments (node_id, attachment_id, role) VALUES (?, ?, ?)`)
    .run('node-pdf', 'pdf-attachment-1', 'reference');

  const snapshot = loadWorkspaceSnapshot();

  expect(snapshot?.nodesById['node-pdf']?.attachments).toEqual([{
    attachmentId: 'pdf-attachment-1',
    mimeType: 'application/pdf',
    originalName: 'Paper.pdf',
    role: 'reference'
  }]);
});

it('loads lightweight workspace version metadata without building a snapshot', () => {
  seedNode('node-1', 0);
  upsertNodeSnapshot({
    nodeId: 'node-2',
    parentNodeId: null,
    kind: 'topic',
    title: 'title:node-2',
    isTitleManual: true,
    content: 'content:node-2',
    reveal: null,
    anchorLink: null,
    position: 1,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2099-03-07T00:00:00.000Z'
  });

  expect(loadWorkspaceVersionMetadata()).toEqual({
    hasSnapshot: true,
    workspaceVersion: '2099-03-07T00:00:00.000Z'
  });
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
