// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-workspace-search-ancestor-tests';

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
import { searchWorkspace } from './workspaceSearch.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-search-ancestor-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertNode(input: { content: string; deletedAt?: string | null; id: string; parentId?: string | null; title: string; updatedAt: string }) {
  upsertNodeSnapshot({
    nodeId: input.id,
    parentNodeId: input.parentId ?? null,
    kind: 'topic',
    title: input.title,
    isTitleManual: true,
    content: input.content,
    reveal: null,
    anchorLink: null,
    position: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: input.updatedAt
  });
  if (input.deletedAt) {
    softDeleteNodes({
      nodeIds: [input.id],
      deletedAt: input.deletedAt
    });
  }
}

it('does not return live descendants hidden under deleted ancestors', () => {
  insertNode({
    id: 'deleted-parent',
    title: 'Deleted Parent',
    content: '',
    deletedAt: '2026-03-04T00:00:00.000Z',
    updatedAt: '2026-03-04T00:00:00.000Z'
  });
  insertNode({
    id: 'hidden-child',
    parentId: 'deleted-parent',
    title: 'Hidden Atlas Child',
    content: 'Atlas marker hidden under a deleted parent.',
    updatedAt: '2026-03-05T00:00:00.000Z'
  });

expect(searchWorkspace('Atlas').map((result) => result.id)).not.toContain('hidden-child');
});
