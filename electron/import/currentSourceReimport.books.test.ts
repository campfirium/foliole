// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-current-source-reimport-books-tests';

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

vi.mock('../sync/primaryDeviceState.js', () => ({
  canDesktopRunExternalSources: vi.fn(() => true)
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { saveJsonSetting } from '../database/settingsStore.js';

import { reimportCurrentTopicSource } from './currentSourceReimport.js';
import { saveImportManagerSettings } from './importManagerSettings.js';
import { buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import { runReadwiseReaderImport } from './readwiseReaderImportRun.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-current-source-reimport-books-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function readNodeContent(nodeId: string) {
  return (openDatabaseConnection().sqlite
    .prepare('SELECT content FROM nodes WHERE id = ? AND deleted_at IS NULL')
    .get(nodeId) as { content: string } | undefined)?.content ?? '';
}

function readActiveChildNodeIds(nodeId: string) {
  return (openDatabaseConnection().sqlite
    .prepare('SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL ORDER BY id')
    .all(nodeId) as Array<{ id: string }>).map((row) => row.id);
}

function writeLegacyPendingBookContent(nodeId: string) {
  openDatabaseConnection().sqlite
    .prepare('UPDATE nodes SET content = ?, updated_at = ? WHERE id = ?')
    .run(
      [
        '# Book Placeholder',
        '',
        '## Current status',
        '- No highlights yet',
        '- Original file missing',
        '- Book import pending',
        '',
        '## Next actions',
        '- Download original file*',
        '- Load original file*',
        '',
        '*In progress. These actions will be connected in a later task.*'
      ].join('\n'),
      new Date().toISOString(),
      nodeId
    );
}

function writeStalePersistedBooksInventory(paths: { bookHighlightPath: string; bookPrimaryPath: string }) {
  saveJsonSetting(
    'readwise_books_inventory_state',
    {
      inventories: {
        [`${paths.bookPrimaryPath}\u001f${paths.bookHighlightPath}`]: {
          books: [
            {
              annotationStatus: 'has_highlights',
              bodyState: 'unloaded',
              bookKey: 'book placeholder',
              downloadUrl: 'https://readwise.example.com/book-placeholder.epub',
              epubPath: null,
              epubStatus: 'missing',
              fullDocumentMarkdownPath: path.join(paths.bookPrimaryPath, 'Book Placeholder.md'),
              generatedNodeId: buildReadwiseBookPlaceholderNodeId('book placeholder'),
              highlightCount: 1,
              highlightMarkdownPath: path.join(paths.bookHighlightPath, 'Book Placeholder.md'),
              highlightState: 'pending',
              highlights: [{ note: null, text: 'stale cached quote' }],
              highlightUnmatchedCount: null,
              importStatus: 'pending',
              nodeStatus: 'generated',
              title: 'Book Placeholder'
            }
          ],
          fullDocumentDirectoryPath: paths.bookPrimaryPath,
          highlightDirectoryPath: paths.bookHighlightPath,
          scannedAt: '2026-05-20T00:00:00.000Z'
        }
      },
      version: 2
    },
    '2026-05-20T00:00:00.000Z'
  );
}

async function prepareBooksSource() {
  const readwiseRoot = path.join(tempRoot, 'Readwise');
  const bookPrimaryPath = path.join(readwiseRoot, 'Full Document Contents', 'Books');
  const bookHighlightPath = path.join(readwiseRoot, 'Books');
  await fs.mkdir(bookPrimaryPath, { recursive: true });
  await fs.mkdir(bookHighlightPath, { recursive: true });
  await fs.writeFile(
    path.join(bookPrimaryPath, 'Book Placeholder.md'),
    '# Book Placeholder\n\n## Metadata\n- Download URL: https://readwise.example.com/book-placeholder.epub\n',
    'utf8'
  );
  await fs.writeFile(path.join(bookHighlightPath, 'Book Placeholder.md'), '# Book Placeholder\n\n## Highlights\nbook quote\n', 'utf8');
  saveImportManagerSettings({
    readwiseReaderConfig: {
      enabled: true,
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      validatedAt: '2026-05-18T00:00:00.000Z',
      withHighlightsDestination: 'inbox',
      withoutHighlightsDestination: 'off'
    },
    readwiseRootPath: readwiseRoot,
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: bookHighlightPath,
        id: 'draft-readwise-source-books',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'books',
        primaryPath: bookPrimaryPath
      }
    ]
  });
  return { bookHighlightPath, bookPrimaryPath };
}

it('refreshes a Readwise Books placeholder through the books source', async () => {
  await prepareBooksSource();
  await runReadwiseReaderImport();

  const nodeId = buildReadwiseBookPlaceholderNodeId('book placeholder');
  writeLegacyPendingBookContent(nodeId);

  await expect(reimportCurrentTopicSource(nodeId)).resolves.toMatchObject({
    node_id: nodeId,
    status: 'reimported'
  });
  expect(readNodeContent(nodeId)).toContain('Full text of this document omitted because this document is an EPUB');
  expect(readNodeContent(nodeId)).toContain('1 highlight');
  expect(readNodeContent(nodeId)).toContain('book quote');
  expect(readNodeContent(nodeId)).toContain('[Download original file');
});

it('forces Books re-import to rebuild from source instead of cached inventory', async () => {
  const paths = await prepareBooksSource();
  await runReadwiseReaderImport();

  const nodeId = buildReadwiseBookPlaceholderNodeId('book placeholder');
  writeStalePersistedBooksInventory(paths);
  await fs.writeFile(
    path.join(paths.bookHighlightPath, 'Book Placeholder.md'),
    '# Book Placeholder\n\n## Highlights\nfresh source quote\n',
    'utf8'
  );

  await expect(reimportCurrentTopicSource(nodeId)).resolves.toMatchObject({
    node_id: nodeId,
    status: 'reimported'
  });
  expect(readNodeContent(nodeId)).toContain('fresh source quote');
  expect(readNodeContent(nodeId)).not.toContain('stale cached quote');
});

it('resets an already imported Books node before rebuilding its placeholder', async () => {
  await prepareBooksSource();
  await runReadwiseReaderImport();

  const nodeId = buildReadwiseBookPlaceholderNodeId('book placeholder');
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO nodes (
         id, parent_id, kind, priority, desired_retention, title, is_title_manual, hide_title_heading,
         content, reveal, anchor_link, created_at, updated_at, deleted_at
       ) VALUES (?, ?, 'topic', NULL, NULL, ?, 1, 0, ?, NULL, NULL, ?, ?, NULL)`
    )
    .run('book-child-1', nodeId, 'Imported chapter', 'Imported chapter body', '2026-05-22T00:00:00.000Z', '2026-05-22T00:00:00.000Z');

  await expect(reimportCurrentTopicSource(nodeId)).resolves.toMatchObject({
    node_id: nodeId,
    status: 'reimported'
  });
  expect(readActiveChildNodeIds(nodeId)).toEqual([]);
  expect(readNodeContent(nodeId)).toContain('Full text of this document omitted because this document is an EPUB');
  expect(readNodeContent(nodeId)).toContain('book quote');
});
