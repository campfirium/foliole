// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-workspace-search-sidecar-degradation-tests';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-search-sidecar-degradation-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('keeps workspace search on main-data fallback when sidecar FTS tables are unavailable', () => {
  upsertNodeSnapshot({
    anchorLink: null,
    content: 'Atlas fallback body is still visible.',
    createdAt: '2026-05-26T00:00:00.000Z',
    isTitleManual: true,
    kind: 'topic',
    nodeId: 'node-fallback',
    parentNodeId: null,
    position: null,
    reveal: null,
    title: 'Current Atlas',
    updatedAt: '2026-05-26T00:00:00.000Z'
  });
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`CREATE VIRTUAL TABLE main.node_search USING fts5(
    title,
    path,
    content,
    node_id UNINDEXED,
    updated_at UNINDEXED,
    tokenize = 'trigram'
  )`);
  connection.sqlite
    .prepare('INSERT INTO main.node_search (title, path, content, node_id, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('Old Atlas', '', 'main-only stale marker', 'node-fallback', '2026-05-26T00:00:00.000Z');
  connection.sqlite.exec('DROP TABLE search.node_search');

  expect(searchWorkspace('Atlas').map((result) => result.id)).toContain('node-fallback');
  expect(searchWorkspace('main-only stale marker')).toEqual([]);
});
