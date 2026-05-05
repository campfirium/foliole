// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-anchor-link-tests';

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
import { updateNodeAnchorLinks, upsertNodeSnapshot } from './nodeMutations.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-anchor-link-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function getNodeRow(nodeId: string) {
  const connection = openDatabaseConnection();
  return connection.sqlite.prepare('SELECT content, anchor_link FROM nodes WHERE id = ?').get(nodeId) as
    | { content: string; anchor_link: string | null }
    | undefined;
}

it('updates only anchor locator fields without rewriting child content', () => {
  upsertNodeSnapshot({
    nodeId: 'node-parent',
    parentNodeId: null,
    kind: 'topic',
    title: 'node-parent',
    isTitleManual: true,
    content: 'Parent body',
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'node-child',
    parentNodeId: 'node-parent',
    kind: 'topic',
    title: 'Original title',
    isTitleManual: true,
    content: 'Original child body',
    reveal: null,
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight',
      locator: { from: 6, originalText: 'Beta', to: 10 }
    },
    position: 1,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:00.000Z'
  });

  updateNodeAnchorLinks([{
    nodeId: 'node-child',
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight',
      locator: { from: 6, originalText: 'Better', to: 12 }
    },
    updatedAt: '2026-03-06T00:00:03.000Z'
  }]);

  expect(getNodeRow('node-child')).toEqual({
    content: 'Original child body',
    anchor_link: '{"id":"hl-1","kind":"highlight","locator":{"from":6,"originalText":"Better","to":12}}'
  });
});
