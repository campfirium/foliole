// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-books-inventory-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { runPreparedImport } from '../database/importPipeline.js';
import { initializeDatabase } from '../database/migrate.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { loadReadwiseBooksInventory, scanReadwiseBooksInventory } from './readwiseBooksInventory.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-books-inventory-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function seedReadwiseBooksFixture() {
  const highlightDir = path.join(tempRoot, 'Readwise', 'Books');
  const fullDocumentDir = path.join(tempRoot, 'Readwise', 'Full Document Contents', 'Books');
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.mkdir(fullDocumentDir, { recursive: true });

  await fs.writeFile(
    path.join(highlightDir, 'Annotated Book.md'),
    '# Annotated Book\n\n## Highlights\nKeep this quote. [...] (https://example.com)\n',
    'utf8'
  );
  await fs.writeFile(path.join(fullDocumentDir, 'Annotated Book.md'), '# Annotated Book\n\nKeep this quote.\n', 'utf8');

  await fs.writeFile(path.join(highlightDir, 'Plain Book.md'), '# Plain Book\n\n## Highlights\n', 'utf8');
  const plainBookPath = path.join(fullDocumentDir, 'Plain Book.md');
  await fs.writeFile(plainBookPath, '# Plain Book\n\nBody only.\n', 'utf8');
  await fs.writeFile(path.join(fullDocumentDir, 'Plain Book.epub'), 'fake epub bytes', 'utf8');

  await fs.writeFile(path.join(fullDocumentDir, 'Epub Only Book.epub'), 'more fake epub bytes', 'utf8');

  runPreparedImport(
    createPreparedDesktopTextImport({
      content: '# Plain Book\n\nImported node body.\n',
      fileName: 'Plain Book.md',
      filePath: plainBookPath,
      importedAt: '2026-04-03T12:00:00.000Z',
      kind: 'markdown',
      sourceIdentity: 'readwise/books/Plain Book.md',
      sourceLocator: plainBookPath
    })
  );

  return { fullDocumentDir, highlightDir };
}

it('scans readwise books and derives highlight, node, and epub status', async () => {
  const { fullDocumentDir, highlightDir } = await seedReadwiseBooksFixture();

  const inventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });

  expect(inventory.books).toEqual([
    {
      annotationStatus: 'has_highlights',
      bookKey: 'annotated book',
      downloadUrl: null,
      epubPath: null,
      epubStatus: 'missing',
      fullDocumentMarkdownPath: path.join(fullDocumentDir, 'Annotated Book.md'),
      generatedNodeId: expect.any(String),
      highlightMarkdownPath: path.join(highlightDir, 'Annotated Book.md'),
      importStatus: 'pending',
      nodeStatus: 'generated',
      title: 'Annotated Book'
    },
    {
      annotationStatus: 'no_highlights',
      bookKey: 'epub only book',
      downloadUrl: null,
      epubPath: path.join(fullDocumentDir, 'Epub Only Book.epub'),
      epubStatus: 'received',
      fullDocumentMarkdownPath: null,
      generatedNodeId: expect.any(String),
      highlightMarkdownPath: null,
      importStatus: 'pending',
      nodeStatus: 'generated',
      title: 'Epub Only Book'
    },
    {
      annotationStatus: 'no_highlights',
      bookKey: 'plain book',
      downloadUrl: null,
      epubPath: path.join(fullDocumentDir, 'Plain Book.epub'),
      epubStatus: 'received',
      fullDocumentMarkdownPath: path.join(fullDocumentDir, 'Plain Book.md'),
      generatedNodeId: expect.any(String),
      highlightMarkdownPath: path.join(highlightDir, 'Plain Book.md'),
      importStatus: 'pending',
      nodeStatus: 'generated',
      title: 'Plain Book'
    }
  ]);
});

it('restores persisted books inventory after restart when directories are temporarily unavailable', async () => {
  const { fullDocumentDir, highlightDir } = await seedReadwiseBooksFixture();
  const importedAt = '2026-04-03T12:05:00.000Z';
  const epubPath = path.join(fullDocumentDir, 'Plain Book.epub');

  runPreparedImport(
    createPreparedDesktopTextImport({
      content: '# Plain Book\n\nImported from epub.\n',
      fileName: 'Plain Book.epub',
      filePath: epubPath,
      importedAt,
      kind: 'epub',
      sourceLocator: epubPath,
      sourceTrackingMode: 'untracked'
    })
  );

  const firstInventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });

  expect(firstInventory.books.find((book) => book.bookKey === 'plain book')).toMatchObject({
    epubPath,
    importStatus: 'completed',
    nodeStatus: 'generated'
  });

  await fs.rename(path.join(tempRoot, 'Readwise'), path.join(tempRoot, 'Readwise-hidden'));
  closeDatabaseConnection();

  const restoredInventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });

  expect(restoredInventory.books).toEqual(firstInventory.books);
});

it('loads the books inventory from import manager settings', async () => {
  const readwiseRoot = path.join(tempRoot, 'Readwise');
  const highlightDir = path.join(readwiseRoot, 'Books');
  const fullDocumentDir = path.join(readwiseRoot, 'Full Document Contents', 'Books');
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.mkdir(fullDocumentDir, { recursive: true });
  await fs.writeFile(path.join(highlightDir, 'Settings Book.md'), '# Settings Book\n\n## Highlights\n', 'utf8');

  saveImportManagerSettings({
    readwiseRootPath: readwiseRoot,
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: highlightDir,
        id: 'draft-import-source-2',
        keepPreview: null,
        keepState: 'draft',
        kind: 'books',
        primaryPath: fullDocumentDir
      }
    ]
  });

  const inventory = await loadReadwiseBooksInventory();

  expect(inventory.highlightDirectoryPath).toBe(highlightDir);
  expect(inventory.fullDocumentDirectoryPath).toBe(fullDocumentDir);
  expect(inventory.books).toEqual([
    {
      annotationStatus: 'no_highlights',
      bookKey: 'settings book',
      downloadUrl: null,
      epubPath: null,
      epubStatus: 'missing',
      fullDocumentMarkdownPath: null,
      generatedNodeId: expect.any(String),
      highlightMarkdownPath: path.join(highlightDir, 'Settings Book.md'),
      importStatus: 'pending',
      nodeStatus: 'generated',
      title: 'Settings Book'
    }
  ]);
});

it('promotes changed books to the top and gives deleted books a fresh node', async () => {
  const { fullDocumentDir, highlightDir } = await seedReadwiseBooksFixture();
  const initialInventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const plainBook = initialInventory.books.find((book) => book.bookKey === 'plain book');
  expect(plainBook?.generatedNodeId).toBeTruthy();
  const previousNodeId = plainBook!.generatedNodeId;
  const connection = openDatabaseConnection().sqlite;
  connection
    .prepare('UPDATE nodes SET deleted_at = ? WHERE id = ?')
    .run('2026-04-04T00:00:00.000Z', previousNodeId);

  const reloadedInventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });

  expect(reloadedInventory.books[0]).toMatchObject({
    bookKey: 'plain book',
    importStatus: 'pending',
    nodeStatus: 'generated'
  });
  expect(reloadedInventory.books[0]?.generatedNodeId).toBeTruthy();
  expect(reloadedInventory.books[0]?.generatedNodeId).not.toBe(previousNodeId);
});
