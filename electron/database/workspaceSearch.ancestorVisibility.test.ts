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

import { processSearchIndexInvalidations } from '../../lib/core/database/searchIndexInvalidations.js';
import { syncWorkspaceSearchIndexForNodeIds } from '../../lib/core/database/workspaceSearchIndex.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { deleteNodesPermanently, restoreNodes, softDeleteNodes, upsertNodeSnapshot } from './nodeMutations.js';
import { searchWorkspace } from './workspaceSearch.js';
import { insertPdfAttachment } from './workspaceSearchTestSupport.js';

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

it('returns descendants in Trash and updates their state after restoring the parent', () => {
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

  processSearchIndexInvalidations(openDatabaseConnection().driver);
  expect(searchWorkspace('Atlas')).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'hidden-child', isTrashed: true })]));
  restoreNodes({ nodeIds: ['deleted-parent'] });
  processSearchIndexInvalidations(openDatabaseConnection().driver);
  expect(searchWorkspace('Atlas')).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'hidden-child', isTrashed: false })]));
});

it('uses the index snapshot for short terms even when original content differs', () => {
  insertNode({ id: 'indexed', title: 'Indexed topic', content: 'XY marker', updatedAt: '2026-10-01T00:00:00.000Z' });
  const { driver } = openDatabaseConnection();
  syncWorkspaceSearchIndexForNodeIds(driver, ['indexed']);
  driver.execute("UPDATE nodes SET content = 'ZZ replacement', body_blob_hash = NULL WHERE id = 'indexed'");
  expect(searchWorkspace('XY').map((result) => result.id)).toContain('indexed');
  expect(searchWorkspace('ZZ').map((result) => result.id)).not.toContain('indexed');
  syncWorkspaceSearchIndexForNodeIds(driver, ['indexed']);
  expect(searchWorkspace('XY').map((result) => result.id)).not.toContain('indexed');
  expect(searchWorkspace('ZZ').map((result) => result.id)).toContain('indexed');
});

it('ranks live matches before Trash and removes permanently deleted indexed content', () => {
  insertNode({ id: 'live', title: 'Live', content: 'ranking marker', updatedAt: '2026-09-01T00:00:00.000Z' });
  insertNode({ id: 'trash', title: 'ranking marker', content: 'ranking marker', deletedAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' });
  processSearchIndexInvalidations(openDatabaseConnection().driver);
  expect(searchWorkspace('ranking marker').map((result) => [result.id, result.isTrashed])).toEqual([['live', false], ['trash', true]]);
  deleteNodesPermanently({ nodeIds: ['trash'], nodeOrder: ['live'] });
  expect(searchWorkspace('ranking marker').map((result) => result.id)).toEqual(['live']);
});

it('maintains removed source searches without refreshing the original source', () => {
  const { driver } = openDatabaseConnection();
  driver.execute(`INSERT INTO keep_import_items (rule_id, source_path, source_mtime_ms, source_size_bytes,
    source_state, local_node_state, last_status, first_seen_at, last_seen_at)
    VALUES ('rule', '/Missing/retained.md', 1, 1, 'present', 'locally_deleted', 'blocked_deleted', 'now', 'now')`);
  driver.execute(`INSERT INTO keep_import_item_cache (rule_id, source_path, title, content, content_preview,
    source_mtime_ms, source_size_bytes, refreshed_at)
    VALUES ('rule', '/Missing/retained.md', 'Retained source', 'XY source marker', 'XY source marker', 1, 1, 'now')`);
  expect(searchWorkspace('XY')[0]).toMatchObject({ kind: 'removed', title: 'Retained source',
    removedMatch: { entry: { ruleId: 'rule', sourcePath: '/Missing/retained.md' } } });
  closeDatabaseConnection();
  initializeDatabase();
  expect(searchWorkspace('XY')[0]).toMatchObject({ kind: 'removed', title: 'Retained source' });
  openDatabaseConnection().driver.execute("UPDATE keep_import_items SET local_node_state = 'active' WHERE rule_id = 'rule'");
  expect(searchWorkspace('XY')).toEqual([]);
});

it('keeps PDF page and boundary matches in the Trash index snapshot', () => {
  insertNode({ id: 'pdf-parent', title: 'PDF parent', content: '', updatedAt: 'now' });
  insertNode({ id: 'pdf-owner', parentId: 'pdf-parent', title: 'Owner', content: '', updatedAt: 'now' });
  const attachmentId = 'a'.repeat(64);
  insertPdfAttachment({ nodeId: 'pdf-owner', id: attachmentId, originalName: 'Indexed.pdf', status: 'ready' });
  const { driver } = openDatabaseConnection();
  driver.execute('INSERT INTO pdf_page_text (attachment_id, page, text) VALUES (?, 1, ?)', [attachmentId, 'page XY cross']);
  driver.execute('INSERT INTO pdf_page_text (attachment_id, page, text) VALUES (?, 2, ?)', [attachmentId, 'boundary marker']);
  softDeleteNodes({ nodeIds: ['pdf-parent'], deletedAt: '2026-10-01T00:00:00.000Z' });
  processSearchIndexInvalidations(driver);
  expect(searchWorkspace('XY')[0]).toMatchObject({ id: 'pdf-owner', kind: 'pdf', isTrashed: true });
  expect(searchWorkspace('crossboundary')[0]).toMatchObject({ id: 'pdf-owner', kind: 'pdf', isTrashed: true });
  driver.execute('UPDATE pdf_page_text SET text = ?', ['ZZ source replacement']);
  expect(searchWorkspace('XY')[0]).toMatchObject({ id: 'pdf-owner', kind: 'pdf' });
  expect(searchWorkspace('ZZ')).toEqual([]);
});
