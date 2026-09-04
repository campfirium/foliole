// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-book-highlight-placement-tests';

const { showOpenDialog } = vi.hoisted(() => ({
  showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/tmp/selected-book.epub'] })
}));

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => mockedAppDataDir) },
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

import { createReadwiseImportSources } from '../../lib/core/import/importManagerSettings.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { openDatabaseConnection, closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { placeReadwiseBookHighlights } from './readwiseBookHighlightPlacement.js';
import { loadReadwiseBookEpub } from './readwiseBookManualActions.js';
import { buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import { createMultiChapterBookEpub } from './readwiseBooksEndToEnd.fixture.js';
import { scanReadwiseBooksInventory } from './readwiseBooksInventory.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-book-highlight-placement-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
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
  saveImportManagerSettings({
    readwiseReaderConfig: { ...createDefaultReadwiseReaderConfig(), enabled: true },
    readwiseRootPath: readwiseRoot,
    readwiseSources: createReadwiseImportSources(readwiseRoot).map((source) =>
      source.kind === 'books' ? { ...source, keepState: 'enabled' as const } : source
    )
  });
  return { fullDocumentDir, highlightDir };
}

function readImportedBook(rootNodeId: string) {
  const connection = openDatabaseConnection().sqlite;
  const chapters = connection
    .prepare('SELECT id, title, content FROM nodes WHERE parent_id = ? AND deleted_at IS NULL ORDER BY created_at ASC')
    .all(rootNodeId) as Array<{ content: string; id: string; title: string }>;
  const derivedRootChildren = connection
    .prepare('SELECT id FROM nodes WHERE parent_id = ? AND anchor_link IS NOT NULL AND deleted_at IS NULL')
    .all(rootNodeId);
  return { chapters, connection, derivedRootChildren };
}

function parseAnchorLink(value: string) {
  return JSON.parse(value) as {
    id: string;
    kind: string;
    locator?: { from: number; originalText: string; to: number };
  };
}

async function importManualReadwiseBook() {
  const { fullDocumentDir, highlightDir } = await createBooksFixture();
  const selectedEpubPath = await createMultiChapterBookEpub(tempRoot, 'selected-book-multi.epub');
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [selectedEpubPath] });

  const inventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const nodeId = buildReadwiseBookPlaceholderNodeId('manual book');

  expect(inventory.books.find((book) => book.bookKey === 'manual book')?.generatedNodeId).toBeNull();
  await loadReadwiseBookEpub(nodeId!);

  const importedNodeId = (
    openDatabaseConnection().sqlite
      .prepare(
        `SELECT latest_node_id
         FROM import_sources
         WHERE source_name = 'selected-book-multi.epub'
         ORDER BY last_imported_at DESC
         LIMIT 1`
      )
      .get() as { latest_node_id: string }
  ).latest_node_id;
  return { ...readImportedBook(importedNodeId), importedNodeId };
}

async function verifyBlobOnlyPlacement(input: {
  chapterOneId: string;
  chapterTwoId: string;
  connection: ReturnType<typeof openDatabaseConnection>['sqlite'];
  importedNodeId: string;
}) {
  input.connection.prepare('UPDATE nodes SET content = ? WHERE id IN (?, ?)')
    .run('', input.chapterOneId, input.chapterTwoId);
  const args = {
    highlightMarkdownPath: path.join(tempRoot, 'Readwise', 'Books', 'Manual Book.md'),
    importedAt: '2026-08-01T00:00:00.000Z',
    readwiseConfig: createDefaultReadwiseReaderConfig(),
    rootNodeId: input.importedNodeId
  };
  await expect(placeReadwiseBookHighlights(args)).resolves.toEqual({ matchedCount: 2, unmatchedCount: 0 });

  const unavailableHash = input.connection.prepare('SELECT body_blob_hash FROM nodes WHERE id = ?')
    .get(input.chapterOneId) as { body_blob_hash: string };
  const childCount = input.connection.prepare('SELECT COUNT(*) AS count FROM nodes WHERE parent_id IN (?, ?)')
    .get(input.chapterOneId, input.chapterTwoId) as { count: number };
  input.connection.prepare('DELETE FROM content_blob_data WHERE hash = ?').run(unavailableHash.body_blob_hash);
  await expect(placeReadwiseBookHighlights({ ...args, importedAt: '2026-08-01T00:01:00.000Z' }))
    .rejects.toThrow(`node_body_unavailable:${input.chapterOneId}`);
  expect(input.connection.prepare('SELECT COUNT(*) AS count FROM nodes WHERE parent_id IN (?, ?)')
    .get(input.chapterOneId, input.chapterTwoId)).toEqual(childCount);
}

it('anchors readwise book highlights under Blob-only imported chapters', async () => {
  const { chapters, connection, derivedRootChildren, importedNodeId } = await importManualReadwiseBook();
  const chapterOne = chapters.find((row) => row.title === 'Chapter 1');
  const chapterTwo = chapters.find((row) => row.title === 'Chapter 2');

  expect(derivedRootChildren).toEqual([]);

  const chapterOneDerived = connection
    .prepare('SELECT title, content, anchor_link FROM nodes WHERE parent_id = ? AND deleted_at IS NULL ORDER BY created_at ASC')
    .all(chapterOne?.id) as Array<{ anchor_link: string; content: string; title: string }>;
  const chapterTwoDerived = connection
    .prepare('SELECT title, content, anchor_link FROM nodes WHERE parent_id = ? AND deleted_at IS NULL ORDER BY created_at ASC')
    .all(chapterTwo?.id) as Array<{ anchor_link: string; content: string; title: string }>;
  const chapterOneAnchorLink = parseAnchorLink(chapterOneDerived[0]!.anchor_link);
  const chapterTwoAnchorLink = parseAnchorLink(chapterTwoDerived[0]!.anchor_link);

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

  await verifyBlobOnlyPlacement({
    chapterOneId: chapterOne!.id,
    chapterTwoId: chapterTwo!.id,
    connection,
    importedNodeId
  });
});
