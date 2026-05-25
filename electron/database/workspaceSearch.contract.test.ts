// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-workspace-search-contract-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { processSearchIndexInvalidations } from '../../lib/core/database/searchIndexInvalidations.js';
import { rebuildWorkspaceSearchIndexes } from '../../lib/core/database/workspaceSearchIndex.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { closeExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { initializeDatabase } from './migrate.js';
import { restoreNodes, softDeleteNodes, upsertNodeSnapshot } from './nodeMutations.js';
import { searchWorkspace } from './workspaceSearch.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-search-contract-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function upsertSearchNode(input: {
  content: string;
  id: string;
  kind?: 'folder' | 'topic';
  parentNodeId?: string | null;
  title: string;
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
    createdAt: '2026-05-25T00:00:00.000Z',
    updatedAt: '2026-05-25T00:00:00.000Z'
  });
}

function processSearchQueue() {
  processSearchIndexInvalidations(openDatabaseConnection().driver);
}

function nodeSearchStats() {
  return openDatabaseConnection()
    .sqlite.prepare(
      'SELECT COUNT(*) AS rows, COUNT(DISTINCT content) AS distinct_content FROM node_search'
    )
    .get();
}

it('keeps Chinese and mixed trigram queries searchable through the workspace index', () => {
  upsertSearchNode({
    id: 'node-cjk-mixed',
    title: 'Model Notes',
    content: 'Open AI 新模型 o1 中国 launch notes.'
  });
  processSearchQueue();

  expect(searchWorkspace('模型').map((result) => result.id)).toContain('node-cjk-mixed');
  expect(searchWorkspace('新模型').map((result) => result.id)).toContain('node-cjk-mixed');
  expect(searchWorkspace('Open AI 新模型 o1').map((result) => result.id)).toContain(
    'node-cjk-mixed'
  );
});

it('keeps path updates and delete restore visibility symmetric', () => {
  upsertSearchNode({ id: 'folder-parent', kind: 'folder', title: 'Inbox', content: '' });
  upsertSearchNode({
    id: 'node-child',
    parentNodeId: 'folder-parent',
    title: 'Draft',
    content: 'contract marker'
  });
  processSearchQueue();
  expect(searchWorkspace('Inbox').map((result) => result.id)).toContain('node-child');

  upsertSearchNode({ id: 'folder-parent', kind: 'folder', title: 'Research Inbox', content: '' });
  processSearchQueue();
  expect(searchWorkspace('Research').map((result) => result.id)).toContain('node-child');

  softDeleteNodes({ nodeIds: ['folder-parent'], deletedAt: '2026-05-25T00:10:00.000Z' });
  processSearchQueue();
  expect(searchWorkspace('contract marker')).toEqual([]);

  restoreNodes({ nodeIds: ['folder-parent'] });
  processSearchQueue();
  expect(searchWorkspace('contract marker').map((result) => result.id)).toContain('node-child');
});

it('keeps rebuild idempotent and indexes body blobs before inline content', () => {
  const connection = openDatabaseConnection();
  const bodyBlobHash = upsertTextBodyBlob(
    connection.driver,
    'canonical blob atlas marker',
    '2026-05-25T00:00:00.000Z'
  );
  upsertSearchNode({
    id: 'node-blob-contract',
    title: 'Blob Contract',
    content: 'inline atlas should not be indexed'
  });
  connection.driver.execute('UPDATE nodes SET body_blob_hash = ? WHERE id = ?', [
    bodyBlobHash,
    'node-blob-contract'
  ]);
  upsertSearchNode({
    id: 'node-inline-contract',
    title: 'Inline Contract',
    content: 'inline atlas remains searchable'
  });

  rebuildWorkspaceSearchIndexes(connection.driver);
  const firstStats = nodeSearchStats();
  rebuildWorkspaceSearchIndexes(connection.driver);

  expect(nodeSearchStats()).toEqual(firstStats);
  expect(searchWorkspace('canonical blob atlas').map((result) => result.id)).toContain(
    'node-blob-contract'
  );
  expect(
    searchWorkspace('inline atlas should not be indexed').map((result) => result.id)
  ).not.toContain('node-blob-contract');
  expect(searchWorkspace('inline atlas remains searchable').map((result) => result.id)).toContain(
    'node-inline-contract'
  );
});
