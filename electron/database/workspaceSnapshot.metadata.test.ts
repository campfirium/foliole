// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-workspace-snapshot-metadata-tests';

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
import { upsertNodeSnapshot } from './nodeMutations.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-snapshot-metadata-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
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

  expect(loadWorkspaceSnapshot()?.nodesById['node-virtual']?.virtualFilter).toEqual({
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

  expect(loadWorkspaceSnapshot()?.untitledSequenceByParent).toEqual({ __root__: 7 });
});

it('loads source-scoped image excerpt sequence state without advancing it for manual titles', () => {
  upsertNodeSnapshot({
    nodeId: 'pdf-1', parentNodeId: null, kind: 'topic', title: 'Source PDF', isTitleManual: true,
    content: '', reveal: null, anchorLink: null, position: 0,
    createdAt: '2026-03-18T00:00:00.000Z', updatedAt: '2026-03-18T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'excerpt-3', parentNodeId: 'pdf-1', kind: 'topic', title: 'Excerpt 3', isTitleManual: false,
    content: '![Image excerpt](asset://image.png)', reveal: null,
    anchorLink: {
      id: 'anchor-3', kind: 'image-excerpt',
      locator: { height: 0.2, page: 2, width: 0.3, x: 0.1, y: 0.2 }
    },
    position: 1, createdAt: '2026-03-18T00:00:01.000Z', updatedAt: '2026-03-18T00:00:01.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'manual-excerpt', parentNodeId: 'pdf-1', kind: 'topic', title: 'Excerpt 99', isTitleManual: true,
    content: '![Image excerpt](asset://manual.png)', reveal: null,
    anchorLink: {
      id: 'anchor-manual', kind: 'image-excerpt',
      locator: { height: 0.2, page: 4, width: 0.3, x: 0.2, y: 0.3 }
    },
    position: 2, createdAt: '2026-03-18T00:00:02.000Z', updatedAt: '2026-03-18T00:00:02.000Z'
  });

  expect(loadWorkspaceSnapshot()?.untitledSequenceByParent).toEqual({ 'image-excerpt:pdf-1': 4 });
});
