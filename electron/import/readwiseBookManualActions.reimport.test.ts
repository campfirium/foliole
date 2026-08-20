// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-book-manual-reimport-tests';

const { showOpenDialog } = vi.hoisted(() => ({
  showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/tmp/selected-book.epub'] })
}));
const sourceOwnerMock = vi.hoisted(() => ({ canRunExternalSources: true }));

vi.mock('electron', () => ({
  dialog: { showOpenDialog },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) }
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({
  canCurrentHostRunReadwise: vi.fn(() => sourceOwnerMock.canRunExternalSources)
}));

import { createReadwiseImportSources } from '../../lib/core/import/importManagerSettings.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { createTestZip } from '../ipc/testZipBuilder.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { loadReadwiseBookEpub } from './readwiseBookManualActions.js';
import { buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import { scanReadwiseBooksInventory } from './readwiseBooksInventory.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-book-manual-reimport-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  sourceOwnerMock.canRunExternalSources = true;
  initializeDatabase();
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
  await fs.writeFile(path.join(highlightDir, 'Manual Book.md'), '# Manual Book\n\n## Highlights\nSaved quote.\n', 'utf8');
  await fs.writeFile(path.join(fullDocumentDir, 'Manual Book.md'), '# Manual Book\n\n## Full Document\nWaiting for EPUB.\n', 'utf8');
  saveImportManagerSettings({
    readwiseReaderConfig: { ...createDefaultReadwiseReaderConfig(), enabled: true },
    readwiseRootPath: readwiseRoot,
    readwiseSources: createReadwiseImportSources(readwiseRoot).map((source) =>
      source.kind === 'books' ? { ...source, keepState: 'enabled' as const } : source
    )
  });
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

it('reimports into the same readwise book node without creating another root node', async () => {
  const { fullDocumentDir, highlightDir } = await createBooksFixture();
  const selectedEpubPath = await createBookEpub('selected-book.epub');
  showOpenDialog
    .mockResolvedValueOnce({ canceled: false, filePaths: [selectedEpubPath] })
    .mockResolvedValueOnce({ canceled: false, filePaths: [selectedEpubPath] });

  const inventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const placeholderNodeId = buildReadwiseBookPlaceholderNodeId('manual book');

  expect(inventory.books.find((book) => book.bookKey === 'manual book')?.generatedNodeId).toBeNull();

  await expect(loadReadwiseBookEpub(placeholderNodeId)).resolves.toMatchObject({ status: 'selected' });
  const firstReloadedInventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const nodeId = firstReloadedInventory.books.find((book) => book.bookKey === 'manual book')?.generatedNodeId;
  expect(nodeId).toBeTruthy();

  await expect(loadReadwiseBookEpub(nodeId!)).resolves.toMatchObject({ status: 'selected' });

  const reloadedInventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const reloadedBook = reloadedInventory.books.find((book) => book.bookKey === 'manual book');
  expect(reloadedBook?.generatedNodeId).toBe(nodeId);

  const rootNodes = openDatabaseConnection().sqlite
    .prepare("SELECT id FROM nodes WHERE title = 'Manual Book' AND parent_id = 'special-inbox' AND deleted_at IS NULL")
    .all() as Array<{ id: string }>;
  expect(rootNodes).toEqual([{ id: nodeId! }]);
});
