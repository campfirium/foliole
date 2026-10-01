// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-search-index-invalidations-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import {
  enqueueWorkspaceSearchInvalidationForNodeIds,
  processSearchIndexInvalidations
} from '../../lib/core/database/searchIndexInvalidations.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { runPreparedImport } from './importPipeline.js';
import { initializeDatabase } from './migrate.js';
import { restoreNodes, softDeleteNodes, upsertNodeSnapshot } from './nodeMutations.js';
import { savePdfPageTextRows } from './pdfPageTextRows.js';
import { searchWorkspace } from './workspaceSearch.js';
import { insertPdfAttachment } from './workspaceSearchTestSupport.js';

const PDF_ATTACHMENT_ID = 'a'.repeat(64);
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-search-index-invalidations-'));
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

function pendingInvalidations() {
  return openDatabaseConnection().sqlite
    .prepare(
      `SELECT invalidation_type, target_id, status
       FROM search_index_invalidations
       WHERE status != 'completed'
       ORDER BY invalidation_type ASC, target_id ASC`
    )
    .all() as Array<{ invalidation_type: string; status: string; target_id: string }>;
}

function seedPdfReferenceNode() {
  const database = openDatabaseConnection().sqlite;
  database.exec(`
    INSERT INTO nodes (
      id, kind, title, is_title_manual, hide_title_heading, content, created_at, updated_at
    ) VALUES (
      'node-pdf', 'topic', 'Paper', 1, 0, '', '2026-05-16T10:00:00.000Z', '2026-05-16T10:00:00.000Z'
    );
  `);
  insertPdfAttachment({ nodeId: 'node-pdf', id: PDF_ATTACHMENT_ID, originalName: 'paper.pdf', status: 'ready' });
}

function upsertSearchNode(input: { content: string; id: string; parentNodeId: string | null; title: string }) {
  upsertNodeSnapshot({
    nodeId: input.id,
    parentNodeId: input.parentNodeId,
    kind: 'topic',
    title: input.title,
    isTitleManual: true,
    content: input.content,
    reveal: null,
    anchorLink: null,
    position: null,
    createdAt: '2026-05-16T10:00:00.000Z',
    updatedAt: '2026-05-16T10:01:00.000Z'
  });
}

it('queues ordinary node edits and searches them after the invalidation consumer runs', () => {
  upsertNodeSnapshot({
    nodeId: 'node-edit',
    parentNodeId: null,
    kind: 'topic',
    title: 'Queued Node',
    isTitleManual: true,
    content: 'Atlas queued content',
    reveal: null,
    anchorLink: null,
    position: null,
    createdAt: '2026-05-16T10:00:00.000Z',
    updatedAt: '2026-05-16T10:01:00.000Z'
  });

  expect(searchWorkspace('Atlas')).toEqual([]);
  expect(pendingInvalidations()).toEqual([
    { invalidation_type: 'node_workspace', status: 'pending', target_id: 'node-edit' }
  ]);

  expect(processSearchIndexInvalidations(openDatabaseConnection().driver)).toEqual({ failed: 0, processed: 1 });
  expect(searchWorkspace('Atlas')[0]).toMatchObject({ id: 'node-edit', kind: 'node' });

  softDeleteNodes({
    nodeIds: ['node-edit'],
    deletedAt: '2026-05-16T10:02:00.000Z'
  });
  processSearchIndexInvalidations(openDatabaseConnection().driver);
  expect(searchWorkspace('Atlas')[0]).toMatchObject({ id: 'node-edit', isTrashed: true });

  restoreNodes({ nodeIds: ['node-edit'] });
  processSearchIndexInvalidations(openDatabaseConnection().driver);
  expect(searchWorkspace('Atlas')[0]).toMatchObject({ id: 'node-edit', kind: 'node' });
});

it('updates moved subtree paths without rebuilding child content', () => {
  upsertSearchNode({ content: '', id: 'folder-a', parentNodeId: null, title: 'Folder A' });
  upsertSearchNode({ content: '', id: 'folder-b', parentNodeId: null, title: 'Folder B' });
  upsertSearchNode({ content: 'Parent body', id: 'article', parentNodeId: 'folder-a', title: 'Article' });
  upsertSearchNode({ content: 'Old child marker', id: 'child', parentNodeId: 'article', title: 'Child' });
  processSearchIndexInvalidations(openDatabaseConnection().driver);
  openDatabaseConnection().sqlite
    .prepare("UPDATE nodes SET content = 'UnindexedFreshToken marker' WHERE id = 'child'")
    .run();

  upsertSearchNode({ content: 'Parent body', id: 'article', parentNodeId: 'folder-b', title: 'Article' });

  expect(pendingInvalidations()).toEqual([
    { invalidation_type: 'node_workspace', status: 'pending', target_id: 'article' }
  ]);
  processSearchIndexInvalidations(openDatabaseConnection().driver);
  expect(
    openDatabaseConnection().sqlite
      .prepare("SELECT content, path FROM search.node_search WHERE node_id = 'child'")
      .get()
  ).toEqual({ content: 'Old child marker', path: 'Folder B / Article' });
  expect(searchWorkspace('UnindexedFreshToken')).toEqual([]);
});

it('marks descendants as Trash through the index queue and clears the mark on restore', () => {
  upsertSearchNode({ content: '', id: 'parent-delete', parentNodeId: null, title: 'Parent' });
  upsertSearchNode({ content: 'Descendant marker', id: 'child-delete', parentNodeId: 'parent-delete', title: 'Child' });
  processSearchIndexInvalidations(openDatabaseConnection().driver);

  softDeleteNodes({
    nodeIds: ['parent-delete'],
    deletedAt: '2026-05-16T10:02:00.000Z'
  });

  expect(searchWorkspace('Descendant marker')[0]).toMatchObject({ id: 'child-delete', isTrashed: false });
  expect(pendingInvalidations()).toEqual([
    { invalidation_type: 'node_workspace', status: 'pending', target_id: 'parent-delete' }
  ]);
  processSearchIndexInvalidations(openDatabaseConnection().driver);
  expect(
    openDatabaseConnection().sqlite
      .prepare("SELECT COUNT(*) AS count FROM search.node_search WHERE node_id IN ('parent-delete', 'child-delete')")
      .get()
  ).toEqual({ count: 2 });
  expect(searchWorkspace('Descendant marker')[0]).toMatchObject({ id: 'child-delete', isTrashed: true });

  restoreNodes({ nodeIds: ['parent-delete'] });
  processSearchIndexInvalidations(openDatabaseConnection().driver);
  expect(searchWorkspace('Descendant marker')[0]).toMatchObject({ id: 'child-delete', kind: 'node', isTrashed: false });
});

it('queues Readwise parent and child highlights without indexing inside the import transaction', () => {
  const imported = runPreparedImport(createPreparedDesktopTextImport({
    content: 'Body with one anchored quote.',
    fileName: 'readwise.md',
    filePath: '/tmp/readwise.md',
    highlightSidecar: [{ label: 'Quote', text: 'one anchored quote' }],
    importedAt: '2026-05-16T10:02:00.000Z',
    kind: 'markdown',
    sourceProfile: 'body_with_highlight_sidecar'
  }));

  expect(imported.nodeId).toEqual(expect.stringMatching(/^node-/));
  expect(searchWorkspace('anchored')).toEqual([]);
  expect(pendingInvalidations().map((row) => row.invalidation_type)).toEqual([
    'node_workspace',
    'node_workspace'
  ]);

  processSearchIndexInvalidations(openDatabaseConnection().driver);
  expect(searchWorkspace('anchored').map((result) => result.kind)).toContain('node');
});

it('queues PDF search invalidation when page text becomes ready', () => {
  seedPdfReferenceNode();
  savePdfPageTextRows(
    PDF_ATTACHMENT_ID,
    [{ page: 1, pageHeight: 1200, pageWidth: 800, text: 'Atlas appears in PDF text.' }],
    '2026-05-16T10:03:00.000Z'
  );

  expect(pendingInvalidations()).toEqual([
    { invalidation_type: 'node_workspace', status: 'pending', target_id: 'node-pdf' }
  ]);
  expect(
    openDatabaseConnection().sqlite
      .prepare('SELECT COUNT(*) AS count FROM search.pdf_search WHERE attachment_id = ?')
      .get(PDF_ATTACHMENT_ID)
  ).toEqual({ count: 0 });

  processSearchIndexInvalidations(openDatabaseConnection().driver);
  expect(searchWorkspace('Atlas')[0]).toMatchObject({
    id: 'node-pdf',
    kind: 'pdf',
    pdfMatch: expect.objectContaining({ attachmentId: PDF_ATTACHMENT_ID })
  });
});

it('marks failed invalidations retryable with attempt and error state', () => {
  const driver = openDatabaseConnection().driver;
  enqueueWorkspaceSearchInvalidationForNodeIds(driver, ['node-fail']);
  driver.execute('DROP TABLE search.node_search');

  expect(processSearchIndexInvalidations(driver)).toEqual({ failed: 1, processed: 0 });
  expect(
    openDatabaseConnection().sqlite
      .prepare('SELECT attempts, last_error, status FROM search_index_invalidations WHERE target_id = ?')
      .get('node-fail')
  ).toMatchObject({
    attempts: 1,
    last_error: expect.stringContaining('node_search'),
    status: 'pending'
  });
});
