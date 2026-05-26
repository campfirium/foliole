// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { processSearchIndexInvalidations } from '../../lib/core/database/searchIndexInvalidations.js';

let mockedAppDataDir = '/tmp/foliole-workspace-search-path-tests';

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
import { upsertNodeSnapshot } from './nodeMutations.js';
import { searchWorkspace } from './workspaceSearch.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-search-path-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function upsertSearchNode(input: {
  content: string;
  id: string;
  kind?: 'folder' | 'topic';
  parentNodeId?: string | null;
  title: string;
  updatedAt: string;
}) {
  upsertNodeSnapshot({
    nodeId: input.id,
    parentNodeId: input.parentNodeId ?? null,
    kind: input.kind ?? 'topic',
    title: input.title,
    isTitleManual: true,
    content: input.content,
    reveal: null,
    anchorLink: null,
    position: null,
    createdAt: '2026-03-03T00:00:00.000Z',
    updatedAt: input.updatedAt
  });
}

function processSearchQueue() {
  processSearchIndexInvalidations(openDatabaseConnection().driver);
}

it('matches breadcrumb path segments from the sqlite FTS index', () => {
  upsertSearchNode({
    id: 'folder-parent',
    kind: 'folder',
    title: 'Reference Shelf',
    content: '',
    updatedAt: '2026-03-03T00:00:00.000Z'
  });
  upsertSearchNode({
    id: 'node-path',
    parentNodeId: 'folder-parent',
    title: 'Meeting Notes',
    content: 'Roadmap draft and next actions.',
    updatedAt: '2026-03-04T00:00:00.000Z'
  });
  processSearchQueue();

  const results = searchWorkspace('Shelf');

  expect(results.some((result) => result.id === 'folder-parent')).toBe(true);
  expect(results.find((result) => result.id === 'node-path')).toMatchObject({
    id: 'node-path',
    kind: 'node',
    title: 'Meeting Notes'
  });
});

it('refreshes descendant path matches after a parent title change', () => {
  upsertSearchNode({
    id: 'folder-rename',
    kind: 'folder',
    title: 'Inbox',
    content: '',
    updatedAt: '2026-03-07T00:00:00.000Z'
  });
  upsertSearchNode({
    id: 'node-child',
    parentNodeId: 'folder-rename',
    title: 'Draft',
    content: 'Ready for review.',
    updatedAt: '2026-03-07T00:00:00.000Z'
  });
  processSearchQueue();

  expect(searchWorkspace('Inbox').find((result) => result.id === 'node-child')).toMatchObject({ id: 'node-child' });

  upsertSearchNode({
    id: 'folder-rename',
    kind: 'folder',
    title: 'Research Inbox',
    content: '',
    updatedAt: '2026-03-08T00:00:00.000Z'
  });
  processSearchQueue();

  expect(searchWorkspace('Inbox').find((result) => result.id === 'node-child')).toMatchObject({ id: 'node-child' });
  expect(searchWorkspace('Research').find((result) => result.id === 'node-child')).toMatchObject({ id: 'node-child' });
});
