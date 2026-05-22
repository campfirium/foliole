// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-sync-preview-books-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import { loadPersistedReadwiseBooksInventory } from './readwiseBooksInventoryState.js';
import { runReadwiseReaderImport } from './readwiseReaderImportRun.js';
import { previewReadwiseReaderImport } from './readwiseSyncPreview.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-sync-preview-books-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function seedReadwiseSources() {
  const readwiseRoot = path.join(tempRoot, 'Readwise');
  const articlePrimaryPath = path.join(readwiseRoot, 'Full Document Contents', 'Articles');
  const articleHighlightPath = path.join(readwiseRoot, 'Articles');
  const bookPrimaryPath = path.join(readwiseRoot, 'Full Document Contents', 'Books');
  const bookHighlightPath = path.join(readwiseRoot, 'Books');
  await fs.mkdir(articlePrimaryPath, { recursive: true });
  await fs.mkdir(articleHighlightPath, { recursive: true });
  await fs.mkdir(bookPrimaryPath, { recursive: true });
  await fs.mkdir(bookHighlightPath, { recursive: true });
  await fs.writeFile(path.join(articlePrimaryPath, 'Highlighted.md'), '# Highlighted\n\nBefore important sentence after.\n', 'utf8');
  await fs.writeFile(path.join(articleHighlightPath, 'Highlighted.md'), '# Highlighted\n\n## Highlights\nimportant sentence\n', 'utf8');
  await fs.writeFile(
    path.join(bookPrimaryPath, 'Book Placeholder.md'),
    '# Book Placeholder\n\n## Full Document\nFull text omitted because this document is an EPUB.\n',
    'utf8'
  );
  await fs.writeFile(path.join(bookHighlightPath, 'Book Placeholder.md'), '# Book Placeholder\n\n## Highlights\nbook quote\n', 'utf8');
  return { articleHighlightPath, articlePrimaryPath, bookHighlightPath, bookPrimaryPath, readwiseRoot };
}

function readActiveNodeTitles() {
  return (openDatabaseConnection().sqlite
    .prepare(`SELECT title FROM nodes WHERE deleted_at IS NULL ORDER BY title ASC`)
    .all() as Array<{ title: string }>).map((row) => row.title);
}

function expectPendingBookInventory(paths: Awaited<ReturnType<typeof seedReadwiseSources>>) {
  const placeholderNodeId = buildReadwiseBookPlaceholderNodeId('book placeholder');
  expect(
    loadPersistedReadwiseBooksInventory({
      fullDocumentDirectoryPath: paths.bookPrimaryPath,
      highlightDirectoryPath: paths.bookHighlightPath
    })?.books
  ).toContainEqual(
    expect.objectContaining({
      annotationStatus: 'has_highlights',
      bodyState: 'unloaded',
      bookKey: 'book placeholder',
      generatedNodeId: placeholderNodeId,
      importStatus: 'pending',
      nodeStatus: 'generated',
      title: 'Book Placeholder'
    })
  );
}

function saveReaderSettings(paths: Awaited<ReturnType<typeof seedReadwiseSources>>) {
  saveImportManagerSettings({
    readwiseReaderConfig: {
      enabled: true,
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      validatedAt: '2026-05-11T00:00:00.000Z',
      withHighlightsDestination: 'inbox',
      withoutHighlightsDestination: 'off'
    },
    readwiseRootPath: paths.readwiseRoot,
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: paths.articleHighlightPath,
        id: 'draft-import-source-1',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'articles',
        primaryPath: paths.articlePrimaryPath
      },
      {
        highlightMode: 'split',
        highlightPath: paths.bookHighlightPath,
        id: 'draft-import-source-books',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'books',
        primaryPath: paths.bookPrimaryPath
      }
    ]
  });
}

it('creates Readwise Books placeholder topics during Reader import', async () => {
  const paths = await seedReadwiseSources();
  saveReaderSettings(paths);

  await expect(previewReadwiseReaderImport()).resolves.toMatchObject({
    total_count: 2,
    with_highlights_count: 2,
    write_count: 2
  });
  await expect(runReadwiseReaderImport()).resolves.toMatchObject({
    entry_count: 2,
    imported_count: 2,
    source_count: 2,
    status: 'completed'
  });
  const readFile = vi.spyOn(fs, 'readFile');
  await expect(runReadwiseReaderImport()).resolves.toMatchObject({
    entry_count: 2,
    imported_count: 0,
    source_count: 2,
    status: 'completed'
  });
  expect(
    readFile.mock.calls
      .map(([filePath]) => String(filePath))
      .filter((filePath) => filePath.includes(`${path.sep}Books${path.sep}`))
  ).toEqual([]);
  readFile.mockRestore();

  const titles = readActiveNodeTitles();
  expect(titles).toContain('Highlighted');
  expect(titles).toContain('Book Placeholder');
  expectPendingBookInventory(paths);
});
