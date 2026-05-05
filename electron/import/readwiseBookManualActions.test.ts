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
import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { loadJsonSetting } from '../database/settingsStore.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';

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

it('binds the selected EPUB to the current book and keeps the received status on reload', async () => {
  const { fullDocumentDir, highlightDir } = await createBooksFixture();

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
    epub_path: '/tmp/selected-book.epub',
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
  expect(reloadedInventory.books.find((book) => book.bookKey === 'manual book')).toMatchObject({
    epubPath: '/tmp/selected-book.epub',
    epubStatus: 'received'
  });

  const snapshot = loadWorkspaceSnapshot();
  expect(snapshot?.nodesById[buildReadwiseBookPlaceholderNodeId('manual book')]?.content).toContain('EPUB received');
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
  const selectedEpubPath = path.join(downloadDir, 'selected-book.epub');
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
