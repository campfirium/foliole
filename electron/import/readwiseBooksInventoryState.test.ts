// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-books-inventory-state-tests';

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
import { closeDatabaseConnection } from '../database/connection.js';
import { runPreparedImport } from '../database/importPipeline.js';
import { initializeDatabase } from '../database/migrate.js';
import { saveJsonSetting } from '../database/settingsStore.js';

import { scanReadwiseBooksInventory } from './readwiseBooksInventory.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-books-inventory-state-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function seedLegacyBook() {
  const highlightDir = path.join(tempRoot, 'Readwise', 'Books');
  const fullDocumentDir = path.join(tempRoot, 'Readwise', 'Full Document Contents', 'Books');
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.mkdir(fullDocumentDir, { recursive: true });
  const filePath = path.join(fullDocumentDir, 'Plain Book.md');
  await fs.writeFile(path.join(highlightDir, 'Plain Book.md'), '# Plain Book\n\n## Highlights\n', 'utf8');
  await fs.writeFile(filePath, '# Plain Book\n\nBody only.\n', 'utf8');
  runPreparedImport(
    createPreparedDesktopTextImport({
      content: '# Plain Book\n\nImported node body.\n',
      fileName: 'Plain Book.md',
      filePath,
      importedAt: '2026-04-03T12:00:00.000Z',
      kind: 'markdown',
      sourceIdentity: 'readwise/books/Plain Book.md',
      sourceLocator: filePath
    })
  );
  return { fullDocumentDir, highlightDir };
}

it('normalizes older persisted inventory entries without body or highlight state', async () => {
  const { fullDocumentDir, highlightDir } = await seedLegacyBook();
  const firstInventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const plainBook = firstInventory.books.find((book) => book.bookKey === 'plain book');
  expect(plainBook?.generatedNodeId).toBeTruthy();
  const legacyBook: Record<string, unknown> = { ...plainBook };
  delete legacyBook.bodyState;
  delete legacyBook.highlightState;
  delete legacyBook.highlightUnmatchedCount;
  legacyBook.importStatus = 'completed';

  saveJsonSetting(
    'readwise_books_inventory_state',
    {
      inventories: {
        [`${fullDocumentDir}\u001f${highlightDir}`]: {
          books: [legacyBook],
          fullDocumentDirectoryPath: fullDocumentDir,
          highlightDirectoryPath: highlightDir,
          scannedAt: '2026-04-03T12:10:00.000Z'
        }
      },
      version: 1
    },
    '2026-04-03T12:10:00.000Z'
  );

  const reloadedInventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });

  expect(reloadedInventory.books.find((book) => book.bookKey === 'plain book')).toMatchObject({
    bodyState: 'loaded',
    highlightState: null,
    highlightUnmatchedCount: null
  });
});
