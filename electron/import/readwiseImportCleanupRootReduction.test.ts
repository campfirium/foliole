// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-cleanup-root-reduction-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('./managedInboxEvents.js', () => ({
  notifyManagedInboxUpdated: vi.fn()
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import { previewReadwiseImportCleanup, runReadwiseImportCleanup } from './readwiseImportCleanup.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-cleanup-root-reduction-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  saveReadwiseSettings();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function saveReadwiseSettings() {
  saveImportManagerSettings({
    readwiseReaderConfig: {
      enabled: true,
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      validatedAt: '2026-05-11T00:00:00.000Z',
      withHighlightsDestination: 'inbox',
      withoutHighlightsDestination: 'off'
    },
    readwiseRootPath: path.join(tempRoot, 'readwise'),
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: path.join(tempRoot, 'readwise', 'Articles'),
        id: 'draft-import-source-1',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'articles',
        primaryPath: path.join(tempRoot, 'readwise', 'Full Document Contents', 'Articles')
      }
    ]
  });
}

function insertNode(id: string, parentId: string | null, title: string, timestamp: string, anchorLink: string | null = null) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO nodes (id, parent_id, kind, title, content, anchor_link, created_at, updated_at)
       VALUES (?, ?, 'topic', ?, ?, ?, ?, ?)`
    )
    .run(id, parentId, title, `# ${title}`, anchorLink, timestamp, timestamp);
}

function insertKeepItem(ruleId: string, sourcePath: string, nodeId: string | null, importedAt: string) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO keep_import_items (
        rule_id, source_path, source_mtime_ms, source_size_bytes, has_source_update,
        last_node_id, last_status, first_seen_at, last_seen_at, last_imported_at
      ) VALUES (?, ?, 1, 1, 0, ?, 'imported', ?, ?, ?)`
    )
    .run(ruleId, sourcePath, nodeId, importedAt, importedAt, importedAt);
}

function readRows<T>(sql: string, ...params: unknown[]) {
  return openDatabaseConnection().sqlite.prepare(sql).all(...params) as T[];
}

it('reduces nested imported records to one top-level cleanup root', () => {
  const importedAt = '2026-05-11T13:01:00.000Z';
  insertNode('node-readwise-parent', null, 'Parent', importedAt);
  insertNode('node-readwise-child', 'node-readwise-parent', 'Child', importedAt);
  insertKeepItem('draft-import-source-1', 'Parent.md', 'node-readwise-parent', importedAt);
  insertKeepItem('draft-import-source-1', 'Parent/Child.md', 'node-readwise-child', importedAt);

  expect(previewReadwiseImportCleanup()).toMatchObject({
    delete_count: 1,
    total_count: 1
  });
  runReadwiseImportCleanup();

  expect(previewReadwiseImportCleanup()).toMatchObject({
    delete_count: 0,
    total_count: 0
  });
  expect(readRows('SELECT id FROM nodes WHERE id IN (?, ?)', 'node-readwise-parent', 'node-readwise-child')).toEqual([]);
});

it('detaches tracking for roots kept by a real user addition', () => {
  const importedAt = '2026-05-11T13:01:00.000Z';
  insertNode('node-readwise-kept', null, 'Kept', importedAt);
  insertNode('node-user-added', 'node-readwise-kept', 'User Added', '2026-05-11T13:01:02.000Z');
  insertNode('node-readwise-deleted', null, 'Deleted', importedAt);
  insertKeepItem('draft-import-source-1', 'Kept.md', 'node-readwise-kept', importedAt);
  insertKeepItem('draft-import-source-1', 'Deleted.md', 'node-readwise-deleted', importedAt);

  const result = runReadwiseImportCleanup();

  expect(result).toMatchObject({ deleted_count: 1, detached_count: 1 });
  expect(previewReadwiseImportCleanup()).toMatchObject({
    delete_count: 0,
    keep_count: 0,
    total_count: 0
  });
  expect(readRows('SELECT source_path FROM keep_import_items')).toEqual([
    { source_path: 'Deleted.md' }
  ]);
});

it('treats Readwise Books EPUB chapters and imported anchors as imported structure', () => {
  const importedAt = '2026-05-11T13:01:00.000Z';
  const bookNodeId = buildReadwiseBookPlaceholderNodeId('manual book');
  insertNode(bookNodeId, 'special-inbox', 'Manual Book', importedAt);
  insertNode('node-epub-chapter-1', bookNodeId, 'Chapter 1', '2026-05-11T13:01:02.000Z');
  insertNode(
    'node-imported-highlight-1',
    'node-epub-chapter-1',
    'Imported Highlight',
    '2026-05-11T13:01:03.000Z',
    JSON.stringify({ id: 'anchor-1', kind: 'highlight', origin: 'imported' })
  );

  expect(previewReadwiseImportCleanup()).toMatchObject({
    delete_count: 1,
    keep_count: 0,
    total_count: 1
  });
  runReadwiseImportCleanup();

  expect(readRows('SELECT id FROM nodes WHERE id IN (?, ?, ?)', bookNodeId, 'node-epub-chapter-1', 'node-imported-highlight-1')).toEqual([]);
});

it('keeps Readwise Books placeholders with a real user child and clears deleted inventory state', () => {
  const importedAt = '2026-05-11T13:01:00.000Z';
  const keptBookNodeId = buildReadwiseBookPlaceholderNodeId('kept book');
  const deletedBookNodeId = buildReadwiseBookPlaceholderNodeId('deleted book');
  insertNode(keptBookNodeId, 'special-inbox', 'Kept Book', importedAt);
  insertNode('node-user-book-note', keptBookNodeId, 'User Book Note', '2026-05-11T13:01:02.000Z');
  insertNode(deletedBookNodeId, 'special-inbox', 'Deleted Book', importedAt);
  saveJsonSetting(
    'readwise_books_inventory_state',
    {
      inventories: {
        books: {
          books: [
            createBookState('kept book', 'Kept Book', keptBookNodeId),
            createBookState('deleted book', 'Deleted Book', deletedBookNodeId)
          ],
          fullDocumentDirectoryPath: path.join(tempRoot, 'readwise', 'Full Document Contents', 'Books'),
          highlightDirectoryPath: path.join(tempRoot, 'readwise', 'Books'),
          scannedAt: importedAt
        }
      },
      version: 2
    },
    importedAt
  );

  runReadwiseImportCleanup();

  const state = loadJsonSetting('readwise_books_inventory_state') as {
    inventories: { books: { books: Array<{ bookKey: string; generatedNodeId: string | null }> } };
  };
  expect(state.inventories.books.books).toEqual([
    expect.objectContaining({ bookKey: 'kept book', generatedNodeId: keptBookNodeId }),
    expect.objectContaining({ bookKey: 'deleted book', generatedNodeId: null })
  ]);
  expect(previewReadwiseImportCleanup()).toMatchObject({
    delete_count: 0,
    keep_count: 1,
    total_count: 1
  });
});

function createBookState(bookKey: string, title: string, generatedNodeId: string) {
  return {
    annotationStatus: 'has_highlights',
    bodyState: 'loaded',
    bookKey,
    downloadUrl: null,
    epubPath: null,
    epubStatus: 'missing',
    fullDocumentMarkdownPath: null,
    generatedNodeId,
    highlightMarkdownPath: null,
    highlightState: 'pending',
    highlightUnmatchedCount: null,
    importStatus: 'completed',
    nodeStatus: 'generated',
    title
  };
}
