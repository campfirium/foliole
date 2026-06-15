// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-search-derived-lifecycle-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { processSearchIndexInvalidations } from '../../lib/core/database/searchIndexInvalidations.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import {
  deleteNodesPermanently,
  moveNodes,
  restoreNodes,
  softDeleteNodes,
  upsertNodeSnapshot
} from './nodeMutations.js';
import { savePdfPageTextRows } from './pdfPageTextRows.js';
import {
  enqueueSubtreeDeletedInvalidation,
  insertPdfAttachment,
  insertStaleSearchRows
} from './workspaceSearchTestSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-search-derived-lifecycle-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await removeTempRoot();
});

async function removeTempRoot() {
  try {
    await fs.rm(tempRoot, { recursive: true, force: true });
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || (error.code !== 'EBUSY' && error.code !== 'EPERM')) {
      throw error;
    }
  }
}

function upsertSearchNode(input: {
  content?: string;
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
    content: input.content ?? '',
    reveal: null,
    anchorLink: null,
    position: null,
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z'
  });
}

function linkReadyPdf(nodeId: string, attachmentId: string, text = 'pdf lifecycle marker') {
  insertPdfAttachment({ id: attachmentId, originalName: `${attachmentId}.pdf`, status: 'ready' });
  openDatabaseConnection().sqlite
    .prepare('INSERT INTO node_attachments (node_id, attachment_id, role) VALUES (?, ?, ?)')
    .run(nodeId, attachmentId, 'reference');
  savePdfPageTextRows(
    attachmentId,
    [{ page: 1, pageHeight: 1200, pageWidth: 800, text }],
    '2026-05-26T00:01:00.000Z'
  );
}

function processSearchQueue() {
  return processSearchIndexInvalidations(openDatabaseConnection().driver);
}

function indexedNodeCount(nodeIds: string[]) {
  const placeholders = nodeIds.map(() => '?').join(', ');
  return openDatabaseConnection()
    .sqlite.prepare(`SELECT COUNT(*) AS count FROM search.node_search WHERE node_id IN (${placeholders})`)
    .get(...nodeIds) as { count: number };
}

function indexedPdfCount(nodeIds: string[]) {
  const placeholders = nodeIds.map(() => '?').join(', ');
  return openDatabaseConnection()
    .sqlite.prepare(`SELECT COUNT(*) AS count FROM search.pdf_search WHERE node_id IN (${placeholders})`)
    .get(...nodeIds) as { count: number };
}

function invalidationCount(type: string, targetIds: string[]) {
  const placeholders = targetIds.map(() => '?').join(', ');
  return openDatabaseConnection()
    .sqlite.prepare(
      `SELECT COUNT(*) AS count
       FROM search_index_invalidations
       WHERE invalidation_type = ?
         AND target_id IN (${placeholders})`
    )
    .get(type, ...targetIds) as { count: number };
}

it('clears node and PDF search rows synchronously before permanently deleting nodes', () => {
  upsertSearchNode({ content: 'parent marker', id: 'parent-delete', title: 'Parent' });
  upsertSearchNode({
    content: 'child marker',
    id: 'child-delete',
    parentNodeId: 'parent-delete',
    title: 'Child'
  });
  linkReadyPdf('child-delete', 'pdf-delete');
  processSearchQueue();

  expect(indexedNodeCount(['parent-delete', 'child-delete'])).toEqual({ count: 2 });
  expect(indexedPdfCount(['child-delete'])).toEqual({ count: 1 });

  deleteNodesPermanently({
    nodeIds: ['parent-delete', 'child-delete'],
    nodeOrder: []
  });

  expect(indexedNodeCount(['parent-delete', 'child-delete'])).toEqual({ count: 0 });
  expect(indexedPdfCount(['child-delete'])).toEqual({ count: 0 });
  expect(invalidationCount('node_subtree_deleted', ['parent-delete', 'child-delete'])).toEqual({ count: 0 });
});

it('removes stale search rows for soft-deleted and restored nodes when they are permanently deleted', () => {
  upsertSearchNode({ content: 'transient marker', id: 'node-transient', title: 'Transient' });
  linkReadyPdf('node-transient', 'pdf-transient');
  processSearchQueue();

  softDeleteNodes({ deletedAt: '2026-05-26T00:02:00.000Z', nodeIds: ['node-transient'] });
  processSearchQueue();
  restoreNodes({ nodeIds: ['node-transient'] });
  processSearchQueue();
  expect(indexedNodeCount(['node-transient'])).toEqual({ count: 1 });
  expect(indexedPdfCount(['node-transient'])).toEqual({ count: 1 });

  deleteNodesPermanently({
    nodeIds: ['node-transient'],
    nodeOrder: []
  });

  expect(indexedNodeCount(['node-transient'])).toEqual({ count: 0 });
  expect(indexedPdfCount(['node-transient'])).toEqual({ count: 0 });
});

it('keeps PDF page text facts and sync state intact while soft delete only hides search', () => {
  upsertSearchNode({ content: 'transient marker', id: 'node-soft-pdf', title: 'Soft PDF' });
  linkReadyPdf('node-soft-pdf', 'pdf-soft', 'soft pdf marker');
  processSearchQueue();
  const beforeState = openDatabaseConnection().sqlite
    .prepare("SELECT content_hash, deleted_at FROM sync_object_state WHERE object_type = 'pdf_page_text' AND object_id = 'pdf-soft:1'")
    .get();

  softDeleteNodes({ deletedAt: '2026-05-26T00:02:00.000Z', nodeIds: ['node-soft-pdf'] });
  processSearchQueue();

  expect(openDatabaseConnection().sqlite
    .prepare("SELECT COUNT(*) AS count FROM pdf_page_text WHERE attachment_id = 'pdf-soft'")
    .get()).toEqual({ count: 1 });
  expect(openDatabaseConnection().sqlite
    .prepare("SELECT content_hash, deleted_at FROM sync_object_state WHERE object_type = 'pdf_page_text' AND object_id = 'pdf-soft:1'")
    .get()).toEqual(beforeState);
  expect(indexedPdfCount(['node-soft-pdf'])).toEqual({ count: 0 });
});

it('clears historical search rows when subtree delete invalidations target missing nodes', () => {
  insertStaleSearchRows('missing-node');
  enqueueSubtreeDeletedInvalidation('missing-node');

  expect(processSearchQueue()).toEqual({ failed: 0, processed: 1 });
  expect(indexedNodeCount(['missing-node'])).toEqual({ count: 0 });
  expect(indexedPdfCount(['missing-node'])).toEqual({ count: 0 });
});

it('clears existing subtrees and exact missing targets in the same delete batch', () => {
  upsertSearchNode({ content: 'parent marker', id: 'batch-parent', title: 'Batch Parent' });
  upsertSearchNode({
    content: 'child marker',
    id: 'batch-child',
    parentNodeId: 'batch-parent',
    title: 'Batch Child'
  });
  upsertSearchNode({ content: 'survivor marker', id: 'batch-survivor', title: 'Batch Survivor' });
  processSearchQueue();
  insertStaleSearchRows('batch-missing');
  enqueueSubtreeDeletedInvalidation('batch-parent');
  enqueueSubtreeDeletedInvalidation('batch-missing');

  expect(processSearchQueue()).toEqual({ failed: 0, processed: 2 });
  expect(indexedNodeCount(['batch-parent', 'batch-child', 'batch-missing'])).toEqual({ count: 0 });
  expect(indexedPdfCount(['batch-missing'])).toEqual({ count: 0 });
  expect(indexedNodeCount(['batch-survivor'])).toEqual({ count: 1 });
});

it('refreshes node and PDF search paths after moving a subtree to a new parent', () => {
  upsertSearchNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' });
  upsertSearchNode({ id: 'folder-b', kind: 'folder', title: 'Folder B' });
  upsertSearchNode({ content: 'article body', id: 'article', parentNodeId: 'folder-a', title: 'Article' });
  upsertSearchNode({ content: 'child body', id: 'child', parentNodeId: 'article', title: 'Child' });
  linkReadyPdf('child', 'pdf-child', 'child pdf body');
  processSearchQueue();

  moveNodes({
    nodeOrder: ['folder-a', 'folder-b'],
    nodes: [
      {
        nodeId: 'article',
        parentNodeId: 'folder-b',
        updatedAt: '2026-05-26T00:03:00.000Z'
      }
    ]
  });
  expect(invalidationCount('node_subtree_path', ['article'])).toEqual({ count: 1 });

  processSearchQueue();
  expect(
    openDatabaseConnection().sqlite.prepare("SELECT path FROM search.node_search WHERE node_id = 'child'").get()
  ).toEqual({ path: 'Folder B / Article' });
  expect(
    openDatabaseConnection().sqlite.prepare("SELECT path FROM search.pdf_search WHERE node_id = 'child'").get()
  ).toEqual({ path: 'Folder B / Article' });
});
