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

import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { openDatabaseConnection, closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { createTestZip } from '../ipc/testZipBuilder.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { loadReadwiseBookEpub } from './readwiseBookManualActions.js';
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
  saveImportManagerSettings({ readwiseRootPath: readwiseRoot });
  return { fullDocumentDir, highlightDir };
}

async function createMultiChapterBookEpub(fileName: string) {
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
          '<?xml version="1.0"?><package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Manual Book</dc:title></metadata><manifest><item id="chapter-1" href="text/chapter-1.xhtml" media-type="application/xhtml+xml"/><item id="chapter-2" href="text/chapter-2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter-1"/><itemref idref="chapter-2"/></spine></package>',
        name: 'OPS/book.opf'
      },
      {
        compression: 'store',
        content:
          '<html><body><h1>Chapter 1</h1><p>First chapter keeps the early remembered quote in place.</p></body></html>',
        name: 'OPS/text/chapter-1.xhtml'
      },
      {
        compression: 'store',
        content:
          '<html><body><h1>Chapter 2</h1><p>Second chapter saves the later insight for a different section.</p></body></html>',
        name: 'OPS/text/chapter-2.xhtml'
      }
    ])
  );
  return filePath;
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
  const selectedEpubPath = await createMultiChapterBookEpub('selected-book-multi.epub');
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [selectedEpubPath] });

  const inventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const nodeId = inventory.books.find((book) => book.bookKey === 'manual book')?.generatedNodeId;

  expect(nodeId).toBeTruthy();
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
  return readImportedBook(importedNodeId);
}

it('anchors readwise book highlights under the matched imported chapters', async () => {
  const { chapters, connection, derivedRootChildren } = await importManualReadwiseBook();
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
});
