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
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { runPreparedImport } from '../database/importPipeline.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import {
  READWISE_BOOK_AUTO_NODE_POLICY,
  buildReadwiseBookPlaceholderNodeId,
  shouldAutoGenerateReadwiseBookNode
} from './readwiseBookNodes.js';
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

  await fs.writeFile(path.join(highlightDir, 'Plain Book.md'), '# Plain Book\n\n## Highlights\n', 'utf8');
  await fs.writeFile(path.join(fullDocumentDir, 'Plain Book.md'), '# Plain Book\n\nWaiting for import.\n', 'utf8');

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
    generatedNodeId: expect.any(String),
    nodeStatus: 'generated'
  });

  const snapshot = loadWorkspaceSnapshot();
  expect(snapshot).not.toBeNull();
  const placeholderNode = annotatedBook?.generatedNodeId ? snapshot?.nodesById[annotatedBook.generatedNodeId] : null;
  expect(placeholderNode).toMatchObject({
    kind: 'topic',
    parentNodeId: 'special-inbox',
    title: 'Annotated Book'
  });
  expect(placeholderNode?.content).toContain('## Current status');
  expect(placeholderNode?.content).toContain('Highlights available');
  expect(placeholderNode?.content).toContain('EPUB missing');
  expect(placeholderNode?.content).toContain('## Next actions');
  expect(placeholderNode?.content).toContain('Download EPUB*');
  expect(placeholderNode?.content).toContain('Load EPUB*');
});

it('uses the same executable auto-node rule for annotated and unannotated books', async () => {
  const { fullDocumentDir, highlightDir } = await createBooksFixture();

  const inventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });

  expect(READWISE_BOOK_AUTO_NODE_POLICY).toBe('all_books');

  const annotatedBook = inventory.books.find((book) => book.bookKey === 'annotated book');
  const plainBook = inventory.books.find((book) => book.bookKey === 'plain book');

  expect(annotatedBook).toBeDefined();
  expect(plainBook).toBeDefined();
  expect(shouldAutoGenerateReadwiseBookNode(annotatedBook!)).toBe(true);
  expect(shouldAutoGenerateReadwiseBookNode(plainBook!)).toBe(true);
  expect(plainBook).toMatchObject({
    annotationStatus: 'no_highlights',
    generatedNodeId: expect.any(String),
    nodeStatus: 'generated'
  });
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

it('moves legacy root-level readwise book placeholders into inbox', async () => {
  const { fullDocumentDir, highlightDir } = await createBooksFixture();
  const legacyNodeId = buildReadwiseBookPlaceholderNodeId('annotated book');

  upsertNodeSnapshot({
    anchorLink: null,
    content: 'Legacy placeholder content',
    createdAt: '2026-04-03T11:00:00.000Z',
    hideTitleHeading: false,
    isTitleManual: true,
    kind: 'topic',
    nodeId: legacyNodeId,
    parentNodeId: null,
    position: 3,
    reveal: null,
    title: 'Annotated Book',
    updatedAt: '2026-04-03T11:00:00.000Z'
  });

  const inventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });

  const annotatedBook = inventory.books.find((book) => book.bookKey === 'annotated book');
  expect(annotatedBook?.generatedNodeId).toBe(legacyNodeId);

  const snapshot = loadWorkspaceSnapshot();
  expect(snapshot?.nodesById[legacyNodeId]).toMatchObject({
    content: 'Legacy placeholder content',
    parentNodeId: 'special-inbox'
  });

  const nodeRow = openDatabaseConnection().sqlite
    .prepare('SELECT parent_id FROM nodes WHERE id = ?')
    .get(legacyNodeId) as { parent_id: string | null } | undefined;
  expect(nodeRow?.parent_id).toBe('special-inbox');
});

it('creates a fresh placeholder node after the previous one was deleted', async () => {
  const { fullDocumentDir, highlightDir } = await createBooksFixture();

  const firstInventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const firstNodeId = firstInventory.books.find((book) => book.bookKey === 'annotated book')?.generatedNodeId;
  expect(firstNodeId).toBeTruthy();

  openDatabaseConnection().sqlite
    .prepare('UPDATE nodes SET deleted_at = ?, updated_at = ? WHERE id = ?')
    .run('2026-04-04T00:00:00.000Z', '2026-04-04T00:00:00.000Z', firstNodeId);

  const recoveredInventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const recoveredBook = recoveredInventory.books.find((book) => book.bookKey === 'annotated book');
  expect(recoveredBook?.generatedNodeId).toBeTruthy();
  expect(recoveredBook?.generatedNodeId).not.toBe(firstNodeId);
  expect(recoveredBook?.nodeStatus).toBe('generated');

  const deletedNode = openDatabaseConnection().sqlite
    .prepare('SELECT deleted_at, parent_id FROM nodes WHERE id = ?')
    .get(firstNodeId) as { deleted_at: string | null; parent_id: string | null } | undefined;
  expect(deletedNode).toEqual({
    deleted_at: '2026-04-04T00:00:00.000Z',
    parent_id: 'special-inbox'
  });

  const freshNode = openDatabaseConnection().sqlite
    .prepare('SELECT deleted_at, parent_id FROM nodes WHERE id = ?')
    .get(recoveredBook?.generatedNodeId) as { deleted_at: string | null; parent_id: string | null } | undefined;
  expect(freshNode).toEqual({
    deleted_at: null,
    parent_id: 'special-inbox'
  });
});
