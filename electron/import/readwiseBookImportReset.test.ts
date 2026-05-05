// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-book-import-reset-tests';

const { showOpenDialog } = vi.hoisted(() => ({
  showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/tmp/selected-book.epub'] })
}));

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

import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { createTestZip } from '../ipc/testZipBuilder.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { resetReadwiseBookImport } from './readwiseBookImportReset.js';
import { loadReadwiseBookEpub } from './readwiseBookManualActions.js';
import { scanReadwiseBooksInventory } from './readwiseBooksInventory.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-book-import-reset-'));
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
  await fs.writeFile(path.join(highlightDir, 'Manual Book.md'), '# Manual Book\n\n## Highlights\nSaved quote.\n', 'utf8');
  await fs.writeFile(path.join(fullDocumentDir, 'Manual Book.md'), '# Manual Book\n\n## Full Document\nWaiting for EPUB.\n', 'utf8');
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

it('resets an imported readwise book back to its pre-load placeholder state', async () => {
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
  await expect(loadReadwiseBookEpub(nodeId!)).resolves.toMatchObject({ status: 'selected' });

  const resetResult = await resetReadwiseBookImport(nodeId!);

  expect(resetResult).toMatchObject({
    book_key: 'manual book',
    node_id: nodeId,
    status: 'reset',
    title: 'Manual Book'
  });
  expect(resetResult.content).toContain('EPUB missing');
  expect(resetResult.content).toContain('Book import pending');

  const reloadedInventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const reloadedBook = reloadedInventory.books.find((book) => book.bookKey === 'manual book');
  expect(reloadedBook).toMatchObject({
    epubPath: null,
    epubStatus: 'missing',
    importStatus: 'pending',
    generatedNodeId: nodeId
  });

  const rootNode = openDatabaseConnection().sqlite
    .prepare('SELECT content, opening_text, reveal FROM nodes WHERE id = ? AND deleted_at IS NULL')
    .get(nodeId) as { content: string; opening_text: string | null; reveal: string | null } | undefined;
  expect(rootNode?.content).toContain('Load EPUB');
  expect(rootNode?.opening_text).toBeNull();
  expect(rootNode?.reveal).toBeNull();

  const childNodes = openDatabaseConnection().sqlite
    .prepare('SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL')
    .all(nodeId) as Array<{ id: string }>;
  expect(childNodes).toEqual([]);
});

it('recreates a deleted readwise book node when re-import is triggered', async () => {
  const { fullDocumentDir, highlightDir } = await createBooksFixture();
  const inventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const nodeId = inventory.books.find((book) => book.bookKey === 'manual book')?.generatedNodeId;
  expect(nodeId).toBeTruthy();

  openDatabaseConnection().sqlite.prepare('UPDATE nodes SET deleted_at = ? WHERE id = ?').run('2026-04-04T11:00:00.000Z', nodeId);

  const resetResult = await resetReadwiseBookImport(nodeId!);
  expect(resetResult).toMatchObject({
    book_key: 'manual book',
    node_id: nodeId,
    status: 'reset'
  });

  const restoredNode = openDatabaseConnection().sqlite
    .prepare('SELECT id, deleted_at, content FROM nodes WHERE id = ?')
    .get(nodeId) as { content: string; deleted_at: string | null; id: string } | undefined;
  expect(restoredNode?.id).toBe(nodeId);
  expect(restoredNode?.deleted_at).toBeNull();
  expect(restoredNode?.content).toContain('Book import pending');
});

it('places re-imported book node at the top of inbox children', async () => {
  const { fullDocumentDir, highlightDir } = await createBooksFixture();
  const inventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: fullDocumentDir,
    highlightDirectoryPath: highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const nodeId = inventory.books.find((book) => book.bookKey === 'manual book')?.generatedNodeId;
  expect(nodeId).toBeTruthy();

  const connection = openDatabaseConnection().sqlite;
  connection
    .prepare(
      `INSERT INTO nodes (
         id, parent_id, kind, priority, desired_retention, title, is_title_manual, hide_title_heading,
         content, reveal, anchor_link, created_at, updated_at, deleted_at
       ) VALUES (?, ?, 'topic', NULL, NULL, ?, 1, 0, '', NULL, NULL, ?, ?, NULL)`
    )
    .run('node-existing-inbox-top', 'special-inbox', 'Older inbox node', '2026-04-04T11:00:00.000Z', '2026-04-04T11:00:00.000Z');
  connection.prepare('INSERT INTO node_order (node_id, position) VALUES (?, ?)').run('node-existing-inbox-top', 5);

  await resetReadwiseBookImport(nodeId!);

  const orderedInboxChildren = connection
    .prepare(
      `SELECT n.id
       FROM nodes n
       JOIN node_order o ON o.node_id = n.id
       WHERE n.parent_id = 'special-inbox' AND n.deleted_at IS NULL
       ORDER BY o.position ASC`
    )
    .all() as Array<{ id: string }>;

  expect(orderedInboxChildren[0]?.id).toBe(nodeId);
});
