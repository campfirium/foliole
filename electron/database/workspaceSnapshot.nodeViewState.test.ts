// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-workspace-snapshot-node-view-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { saveReadingProgress } from './readingProgress.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-snapshot-node-view-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('includes persisted node view state in workspace snapshots', () => {
  upsertNodeSnapshot({
    anchorLink: null,
    content: 'content:node-1',
    createdAt: '2026-04-01T00:00:00.000Z',
    isTitleManual: true,
    kind: 'topic',
    nodeId: 'node-1',
    parentNodeId: null,
    position: 0,
    reveal: null,
    title: 'Node 1',
    updatedAt: '2026-04-01T00:00:00.000Z'
  });
  saveReadingProgress({
    activeNodeId: 'node-1',
    nodeViewStates: [{ nodeId: 'node-1', scrollTop: 24, selectionFrom: 1, selectionTo: 3 }],
    updatedAt: '2026-04-02T00:00:00.000Z'
  });

  expect(loadWorkspaceSnapshot()?.persistedNodeViewById?.['node-1']).toEqual({
    nodeId: 'node-1',
    scrollTop: 24,
    selectionFrom: 1,
    selectionTo: 3,
    source: 'user-scroll',
    updatedAt: '2026-04-02T00:00:00.000Z'
  });
});
