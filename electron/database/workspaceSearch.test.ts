// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-workspace-search-tests';

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
import { searchWorkspace } from './workspaceSearch.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-search-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertNode(input: { content: string; deletedAt?: string | null; id: string; title: string; updatedAt: string }) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO nodes (id, title, content, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(input.id, input.title, input.content, '2026-03-01T00:00:00.000Z', input.updatedAt, input.deletedAt ?? null);
}

it('searches titles and content from sqlite without needing renderer-side content mirrors', () => {
  insertNode({
    id: 'node-title',
    title: 'Project Atlas',
    content: 'Planning notes stay in sqlite until the node is opened.',
    updatedAt: '2026-03-03T00:00:00.000Z'
  });
  insertNode({
    id: 'node-content',
    title: 'Weekly Log',
    content: 'Atlas launch checklist and follow-up notes.',
    updatedAt: '2026-03-02T00:00:00.000Z'
  });
  insertNode({
    id: 'node-deleted',
    title: 'Atlas Archive',
    content: 'Should stay hidden from search results.',
    deletedAt: '2026-03-04T00:00:00.000Z',
    updatedAt: '2026-03-04T00:00:00.000Z'
  });

  const results = searchWorkspace('Atlas');

  expect(results).toHaveLength(2);
  expect(results[0]).toEqual({
    id: 'node-title',
    title: 'Project Atlas',
    excerpt: 'Planning notes stay in sqlite until the node is opened.'
  });
  expect(results[1]).toMatchObject({
    id: 'node-content',
    title: 'Weekly Log'
  });
  expect(results[1]?.excerpt).toContain('Atlas launch checklist');
  expect(results[1]?.excerpt).not.toContain('Should stay hidden from search results.');
});
