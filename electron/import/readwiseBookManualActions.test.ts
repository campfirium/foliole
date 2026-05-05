// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-book-manual-action-tests';

const { openExternal, showOpenDialog } = vi.hoisted(() => ({
  openExternal: vi.fn().mockResolvedValue(undefined),
  showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/tmp/selected-book.epub'] })
}));

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

import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { loadJsonSetting } from '../database/settingsStore.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import { createTestZip } from '../ipc/testZipBuilder.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { loadReadwiseBookEpub, openReadwiseBookDownload } from './readwiseBookManualActions.js';
import { buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import { scanReadwiseBooksInventory } from './readwiseBooksInventory.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-book-manual-actions-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  openExternal.mockReset();
  showOpenDialog.mockReset();
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/selected-book.epub'] });
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
    '# Manual Book\n\n## Highlights\nSaved quote. [...] (https://example.com)\n',
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

  saveImportManagerSettings({ readwiseRootPath: readwiseRoot });

  return { fullDocumentDir, highlightDir };
}

async function createBookEpub(fileName: string) {
  const filePath = path.join(tempRoot, fileName);
  await fs.writeFile(
    filePath,
    createTestZip([
      { compression: 'store', content: 'application/epub+zip', name: 'mimetype' },
      {
        compression: 'store',
        content:
          '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
        name: 'META-INF/container.xml'
      },
      {
        compression: 'store',
        content:
          '<?xml version="1.0"?><package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Manual Book</dc:title></metadata><manifest><item id="chapter" href="text/chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>',
        name: 'OPS/book.opf'
      },
      {
        compression: 'store',
        content: '<html><body><h1>Chapter 1</h1><p>First chapter body.</p></body></html>',
        name: 'OPS/text/chapter.xhtml'
      }
    ])
  );
  return filePath;
}

it('extracts the current book download link and opens it through the host shell', async () => {
  const { fullDocumentDir, highlightDir } = await createBooksFixture();

  const inventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const nodeId = inventory.books.find((book) => book.bookKey === 'manual book')?.generatedNodeId;

  expect(nodeId).toBeTruthy();

  const result = await openReadwiseBookDownload(nodeId!);

  expect(result).toEqual({
    book_key: 'manual book',
    status: 'opened',
    title: 'Manual Book',
    url: 'https://readwise.example.com/books/manual-book.epub'
  });
  expect(openExternal).toHaveBeenCalledWith('https://readwise.example.com/books/manual-book.epub');
});

it('extracts the original file link from the readwise full document body and opens it through the host shell', async () => {
  const readwiseRoot = path.join(tempRoot, 'Readwise');
  const highlightDir = path.join(readwiseRoot, 'Books');
  const fullDocumentDir = path.join(readwiseRoot, 'Full Document Contents', 'Books');
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.mkdir(fullDocumentDir, { recursive: true });
  await fs.writeFile(path.join(highlightDir, 'Manual Book.md'), '# Manual Book\n', 'utf8');
  await fs.writeFile(
    path.join(fullDocumentDir, 'Manual Book.md'),
    [
      '# Manual Book',
      '',
      '## Full Document',
      'Waiting for EPUB.'
      ,
      '[Download original file →](https://readwise.io/reader/document_raw_content/287639057)'
    ].join('\n'),
    'utf8'
  );
  saveImportManagerSettings({ readwiseRootPath: readwiseRoot });

  const inventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const nodeId = inventory.books.find((book) => book.bookKey === 'manual book')?.generatedNodeId;

  expect(nodeId).toBeTruthy();

  const result = await openReadwiseBookDownload(nodeId!);

  expect(result).toEqual({
    book_key: 'manual book',
    status: 'opened',
    title: 'Manual Book',
    url: 'https://readwise.io/reader/document_raw_content/287639057'
  });
  expect(openExternal).toHaveBeenCalledWith('https://readwise.io/reader/document_raw_content/287639057');
});

it('imports the selected EPUB into the current readwise book node and keeps that node on reload', async () => {
  const { fullDocumentDir, highlightDir } = await createBooksFixture();
  const selectedEpubPath = await createBookEpub('selected-book.epub');
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [selectedEpubPath] });

  const inventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const nodeId = inventory.books.find((book) => book.bookKey === 'manual book')?.generatedNodeId;

  expect(nodeId).toBeTruthy();

  const result = await loadReadwiseBookEpub(nodeId!);

  expect(result).toEqual({
    book_key: 'manual book',
    epub_path: selectedEpubPath,
    status: 'selected',
    title: 'Manual Book'
  });
  expect(showOpenDialog).toHaveBeenCalledWith({
    filters: [{ extensions: ['epub'], name: 'EPUB' }],
    properties: ['openFile']
  });

  const reloadedInventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const reloadedBook = reloadedInventory.books.find((book) => book.bookKey === 'manual book');
  expect(reloadedBook).toMatchObject({
    epubPath: selectedEpubPath,
    epubStatus: 'received',
    importStatus: 'completed'
  });
  expect(reloadedBook?.generatedNodeId).toBe(nodeId);
  expect(reloadedBook?.generatedNodeId).toBe(buildReadwiseBookPlaceholderNodeId('manual book'));

  const snapshot = loadWorkspaceSnapshot();
  const importedNode = reloadedBook?.generatedNodeId ? snapshot?.nodesById[reloadedBook.generatedNodeId] : null;
  expect(importedNode?.title).toBe('Manual Book');
  expect(importedNode?.content).toContain('# Manual Book');

  const chapters = reloadedBook?.generatedNodeId
    ? (openDatabaseConnection().sqlite
        .prepare('SELECT title FROM nodes WHERE parent_id = ? AND deleted_at IS NULL ORDER BY created_at ASC')
        .all(reloadedBook.generatedNodeId) as Array<{ title: string }>).map((chapter) => chapter.title)
    : [];
  expect(chapters).toContain('Chapter 1');
});

it('reopens the picker from the last selected EPUB folder after restart', async () => {
  const { fullDocumentDir, highlightDir } = await createBooksFixture();
  await fs.writeFile(
    path.join(highlightDir, 'Second Book.md'),
    '# Second Book\n\n## Highlights\nSaved quote.\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(fullDocumentDir, 'Second Book.md'),
    '# Second Book\n\n## Full Document\nWaiting for EPUB.\n',
    'utf8'
  );

  const downloadDir = path.join(tempRoot, 'downloads');
  await fs.mkdir(downloadDir, { recursive: true });
  const selectedEpubPath = await createBookEpub(path.join('downloads', 'selected-book.epub'));
  showOpenDialog
    .mockResolvedValueOnce({ canceled: false, filePaths: [selectedEpubPath] })
    .mockResolvedValueOnce({ canceled: true, filePaths: [] });

  const inventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const firstNodeId = inventory.books.find((book) => book.bookKey === 'manual book')?.generatedNodeId;
  const secondNodeId = inventory.books.find((book) => book.bookKey === 'second book')?.generatedNodeId;

  expect(firstNodeId).toBeTruthy();
  expect(secondNodeId).toBeTruthy();

  await loadReadwiseBookEpub(firstNodeId!);
  expect(loadJsonSetting('readwise_book_epub_picker_state')).toEqual(
    expect.objectContaining({ lastDirectory: downloadDir })
  );

  closeDatabaseConnection();
  initializeDatabase();

  const result = await loadReadwiseBookEpub(secondNodeId!);

  expect(result).toEqual({
    book_key: 'second book',
    epub_path: null,
    status: 'cancelled',
    title: 'Second Book'
  });
  expect(showOpenDialog).toHaveBeenNthCalledWith(2, {
    defaultPath: downloadDir,
    filters: [{ extensions: ['epub'], name: 'EPUB' }],
    properties: ['openFile']
  });
});
