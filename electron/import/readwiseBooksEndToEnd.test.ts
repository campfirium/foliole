// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-books-end-to-end-tests';

const { openExternal, showOpenDialog } = vi.hoisted(() => ({
  openExternal: vi.fn().mockResolvedValue(undefined),
  showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/tmp/selected-book.epub'] })
}));
const primaryDeviceMock = vi.hoisted(() => ({ canRunExternalSources: true }));

vi.mock('electron', () => ({
  dialog: { showOpenDialog },
  shell: { openExternal }
}));
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../sync/primaryDeviceState.js', () => ({
  canDesktopRunExternalSources: vi.fn(() => primaryDeviceMock.canRunExternalSources)
}));

import { createReadwiseImportSources } from '../../lib/core/import/importManagerSettings.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { loadReadwiseBookEpub, openReadwiseBookDownload } from './readwiseBookManualActions.js';
import { buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import { createMultiChapterBookEpub } from './readwiseBooksEndToEnd.fixture.js';
import { scanReadwiseBooksInventory } from './readwiseBooksInventory.js';

let tempRoot = '';

function saveEnabledReadwiseBooksSettings(readwiseRoot: string) {
  saveImportManagerSettings({
    readwiseReaderConfig: { ...createDefaultReadwiseReaderConfig(), enabled: true },
    readwiseRootPath: readwiseRoot,
    readwiseSources: createReadwiseImportSources(readwiseRoot).map((source) =>
      source.kind === 'books' ? { ...source, keepState: 'enabled' as const } : source
    )
  });
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-books-end-to-end-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  primaryDeviceMock.canRunExternalSources = true;
  initializeDatabase();
  openExternal.mockReset();
  showOpenDialog.mockReset();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function createBooksFixture() {
  const readwiseRoot = path.join(tempRoot, 'Readwise');
  const highlightDir = path.join(readwiseRoot, 'Books');
  const fullDocumentDir = path.join(readwiseRoot, 'Full Document Contents', 'Books');
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.mkdir(fullDocumentDir, { recursive: true });
  await fs.writeFile(
    path.join(highlightDir, 'Manual Book.md'),
    [
      '# Manual Book',
      '',
      '## Highlights',
      'early remembered quote [...] (https://example.com/1)',
      '',
      'later insight [...] (https://example.com/2)'
    ].join('\n'),
    'utf8'
  );
  await fs.writeFile(
    path.join(fullDocumentDir, 'Manual Book.md'),
    [
      '# Manual Book',
      '',
      '## Metadata',
      '- Download URL: https://readwise.example.com/books/manual-book.epub',
      '',
      '## Full Document',
      'Waiting for EPUB.'
    ].join('\n'),
    'utf8'
  );
  saveEnabledReadwiseBooksSettings(readwiseRoot);
  return { fullDocumentDir, highlightDir };
}

function readImportedBook(connection: ReturnType<typeof openDatabaseConnection>['sqlite'], rootNodeId: string) {
  const chapters = connection
    .prepare('SELECT id, title, content FROM nodes WHERE parent_id = ? AND deleted_at IS NULL ORDER BY created_at ASC')
    .all(rootNodeId) as Array<{ content: string; id: string; title: string }>;
  const rootHighlights = connection
    .prepare('SELECT id FROM nodes WHERE parent_id = ? AND anchor_link IS NOT NULL AND deleted_at IS NULL')
    .all(rootNodeId);
  return { chapters, rootHighlights };
}

function parseAnchorLink(value: string) {
  return JSON.parse(value) as {
    id: string;
    kind: string;
    locator?: { from: number; originalText: string; to: number };
  };
}

function expectDiscoveredPlaceholder(book: Awaited<ReturnType<typeof scanReadwiseBooksInventory>>['books'][number] | undefined) {
  expect(book).toMatchObject({
    annotationStatus: 'has_highlights',
    epubStatus: 'missing',
    importStatus: 'pending',
    nodeStatus: 'missing'
  });
  expect(book?.generatedNodeId).toBeNull();
}

function expectImportedInventory(book: Awaited<ReturnType<typeof scanReadwiseBooksInventory>>['books'][number] | undefined, epubPath: string) {
  expect(book).toMatchObject({
    annotationStatus: 'has_highlights',
    epubPath,
    epubStatus: 'received',
    importStatus: 'completed',
    nodeStatus: 'generated'
  });
  expect(book?.generatedNodeId).toBeTruthy();
}

function expectImportedHighlights(connection: ReturnType<typeof openDatabaseConnection>['sqlite'], rootNodeId: string) {
  const { chapters, rootHighlights } = readImportedBook(connection, rootNodeId);
  const chapterOne = chapters.find((row) => row.title === 'Chapter 1');
  const chapterTwo = chapters.find((row) => row.title === 'Chapter 2');
  const chapterOneDerived = connection
    .prepare('SELECT title, content, anchor_link FROM nodes WHERE parent_id = ? AND deleted_at IS NULL ORDER BY created_at ASC')
    .all(chapterOne!.id) as Array<{ anchor_link: string; content: string; title: string }>;
  const chapterTwoDerived = connection
    .prepare('SELECT title, content, anchor_link FROM nodes WHERE parent_id = ? AND deleted_at IS NULL ORDER BY created_at ASC')
    .all(chapterTwo!.id) as Array<{ anchor_link: string; content: string; title: string }>;
  const chapterOneAnchorLink = parseAnchorLink(chapterOneDerived[0]!.anchor_link);
  const chapterTwoAnchorLink = parseAnchorLink(chapterTwoDerived[0]!.anchor_link);

  expect(rootHighlights).toEqual([]);
  expect(chapterOne?.content).toContain('First chapter keeps the early remembered quote in place.');
  expect(chapterTwo?.content).toContain('Second chapter saves the later insight for a different section.');

  expect(chapterOneDerived.map((row) => ({
    anchorLink: parseAnchorLink(row.anchor_link),
    content: row.content,
    title: row.title
  }))).toEqual([
    {
      anchorLink: expect.objectContaining({
        id: chapterOneAnchorLink.id,
        kind: 'highlight',
        locator: expect.objectContaining({ originalText: 'early remembered quote' })
      }),
      content: 'early remembered quote',
      title: 'early remembered quote'
    }
  ]);
  expect(chapterTwoDerived.map((row) => ({
    anchorLink: parseAnchorLink(row.anchor_link),
    content: row.content,
    title: row.title
  }))).toEqual([
    {
      anchorLink: expect.objectContaining({
        id: chapterTwoAnchorLink.id,
        kind: 'highlight',
        locator: expect.objectContaining({ originalText: 'later insight' })
      }),
      content: 'later insight',
      title: 'later insight'
    }
  ]);
}

it('runs the full readwise books loop from discovery to anchored highlights', async () => {
  const { fullDocumentDir, highlightDir } = await createBooksFixture();
  const selectedEpubPath = await createMultiChapterBookEpub(tempRoot, 'selected-book-multi.epub');
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [selectedEpubPath] });

  const discoveredInventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const discoveredBook = discoveredInventory.books.find((book) => book.bookKey === 'manual book');
  expectDiscoveredPlaceholder(discoveredBook);
  const placeholderNodeId = buildReadwiseBookPlaceholderNodeId('manual book');

  await expect(openReadwiseBookDownload(placeholderNodeId)).resolves.toEqual({
    book_key: 'manual book',
    status: 'opened',
    title: 'Manual Book',
    url: 'https://readwise.example.com/books/manual-book.epub'
  });
  expect(openExternal).toHaveBeenCalledWith('https://readwise.example.com/books/manual-book.epub');

  await expect(loadReadwiseBookEpub(placeholderNodeId)).resolves.toEqual({
    book_key: 'manual book',
    epub_path: selectedEpubPath,
    status: 'selected',
    title: 'Manual Book'
  });

  const reloadedInventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const importedBook = reloadedInventory.books.find((book) => book.bookKey === 'manual book');
  expectImportedInventory(importedBook, selectedEpubPath);

  const connection = openDatabaseConnection().sqlite;
  expectImportedHighlights(connection, importedBook!.generatedNodeId!);
});
