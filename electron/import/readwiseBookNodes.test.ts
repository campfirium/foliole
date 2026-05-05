// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-book-node-tests';

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
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import { buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import { scanReadwiseBooksInventory } from './readwiseBooksInventory.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-book-node-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function createBooksFixture() {
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

  const importedBookPath = path.join(fullDocumentDir, 'Imported Book.md');
  await fs.writeFile(path.join(highlightDir, 'Imported Book.md'), '# Imported Book\n\n## Highlights\n', 'utf8');
  await fs.writeFile(importedBookPath, '# Imported Book\n\nExisting imported body.\n', 'utf8');

  runPreparedImport(
    createPreparedDesktopTextImport({
      content: '# Imported Book\n\nExisting imported body.\n',
      fileName: 'Imported Book.md',
      filePath: importedBookPath,
      importedAt: '2026-04-03T12:00:00.000Z',
      kind: 'markdown',
      sourceIdentity: 'readwise/books/Imported Book.md',
      sourceLocator: importedBookPath
    })
  );

  return { fullDocumentDir, highlightDir };
}

it('creates minimal readwise book nodes with status and action placeholders', async () => {
  const { fullDocumentDir, highlightDir } = await createBooksFixture();

  const inventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });

  const annotatedBook = inventory.books.find((book) => book.bookKey === 'annotated book');
  expect(annotatedBook).toMatchObject({
    generatedNodeId: buildReadwiseBookPlaceholderNodeId('annotated book'),
    nodeStatus: 'generated'
  });

  const snapshot = loadWorkspaceSnapshot();
  expect(snapshot).not.toBeNull();
  const placeholderNode = snapshot?.nodesById[buildReadwiseBookPlaceholderNodeId('annotated book')];
  expect(placeholderNode).toMatchObject({
    kind: 'topic',
    parentNodeId: null,
    title: 'Annotated Book'
  });
  expect(placeholderNode?.content).toContain('## Current status');
  expect(placeholderNode?.content).toContain('Highlights available');
  expect(placeholderNode?.content).toContain('EPUB missing');
  expect(placeholderNode?.content).toContain('## Next actions');
  expect(placeholderNode?.content).toContain('Download EPUB*');
  expect(placeholderNode?.content).toContain('Load EPUB*');
});

it('keeps existing imported book content instead of replacing it with the placeholder body', async () => {
  const { fullDocumentDir, highlightDir } = await createBooksFixture();

  const inventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });

  const importedBook = inventory.books.find((book) => book.bookKey === 'imported book');
  expect(importedBook?.generatedNodeId).toBeTruthy();

  const snapshot = loadWorkspaceSnapshot();
  const importedNode = importedBook?.generatedNodeId ? snapshot?.nodesById[importedBook.generatedNodeId] : null;
  expect(importedNode?.content).toContain('Existing imported body.');
  expect(importedNode?.content).not.toContain('## Next actions');
});
