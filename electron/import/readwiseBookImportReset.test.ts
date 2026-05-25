// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-book-import-reset-tests';

const { showOpenDialog } = vi.hoisted(() => ({
  showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/tmp/selected-book.epub'] })
}));
const primaryDeviceMock = vi.hoisted(() => ({
  canRunExternalSources: true
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
vi.mock('../sync/primaryDeviceState.js', () => ({
  canDesktopRunExternalSources: vi.fn(() => primaryDeviceMock.canRunExternalSources)
}));

import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { listRemovedKeepImportItems } from '../database/keepImportItems.js';
import { initializeDatabase } from '../database/migrate.js';
import { softDeleteNodes, upsertNodeSnapshot } from '../database/nodeMutations.js';
import { createTestZip } from '../ipc/testZipBuilder.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { resetReadwiseBookImport } from './readwiseBookImportReset.js';
import { loadReadwiseBookEpub } from './readwiseBookManualActions.js';
import { buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import { scanReadwiseBooksInventory } from './readwiseBooksInventory.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-book-import-reset-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  primaryDeviceMock.canRunExternalSources = true;
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
    readwiseRootPath: readwiseRoot,
    readwiseReaderConfig: { enabled: true },
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: highlightDir,
        id: 'draft-import-source-2',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'books',
        primaryPath: fullDocumentDir
      }
    ]
  });
  return { fullDocumentDir, highlightDir };
}

function seedManualBookPlaceholder() {
  const nodeId = buildReadwiseBookPlaceholderNodeId('manual book');
  upsertNodeSnapshot({
    anchorLink: null,
    content: '# Manual Book\n\nWaiting for EPUB.',
    createdAt: '2026-04-04T10:00:00.000Z',
    hideTitleHeading: false,
    isTitleManual: true,
    kind: 'topic',
    nodeId,
    openingText: null,
    parentNodeId: 'special-inbox',
    position: null,
    reveal: null,
    title: 'Manual Book',
    updatedAt: '2026-04-04T10:00:00.000Z'
  });
  return nodeId;
}

async function scanBooksFixture(paths: { fullDocumentDir: string; highlightDir: string }) {
  await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: paths.fullDocumentDir,
    highlightDirectoryPath: paths.highlightDir,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
}

function expectResetPlaceholderContent(content: string | null | undefined) {
  expect(content).toContain('Full text of this document omitted because this document is an EPUB');
  expect(content).toContain('Saved quote.');
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

  await scanBooksFixture({ fullDocumentDir, highlightDir });
  const nodeId = seedManualBookPlaceholder();

  await expect(loadReadwiseBookEpub(nodeId)).resolves.toMatchObject({ status: 'selected' });

  const resetResult = await resetReadwiseBookImport(nodeId);

  expect(resetResult).toMatchObject({
    book_key: 'manual book',
    node_id: nodeId,
    status: 'reset',
    title: 'Manual Book'
  });
  expect(resetResult.content).toContain('1 highlight');
  expectResetPlaceholderContent(resetResult.content);

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
  expectResetPlaceholderContent(rootNode?.content);
  expect(rootNode?.opening_text).toBeNull();
  expect(rootNode?.reveal).toBeNull();

  const childNodes = openDatabaseConnection().sqlite
    .prepare('SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL')
    .all(nodeId) as Array<{ id: string }>;
  expect(childNodes).toEqual([]);
});

it('blocks readwise book import reset when this desktop is secondary', async () => {
  const { fullDocumentDir, highlightDir } = await createBooksFixture();
  const selectedEpubPath = await createBookEpub('selected-book.epub');
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [selectedEpubPath] });

  await scanBooksFixture({ fullDocumentDir, highlightDir });
  const nodeId = seedManualBookPlaceholder();
  await expect(loadReadwiseBookEpub(nodeId)).resolves.toMatchObject({ status: 'selected' });

  primaryDeviceMock.canRunExternalSources = false;
  await expect(resetReadwiseBookImport(nodeId)).resolves.toMatchObject({
    book_key: 'manual book',
    node_id: nodeId,
    status: 'blocked_secondary',
    title: 'Manual Book'
  });

  const childNodes = openDatabaseConnection().sqlite
    .prepare('SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL')
    .all(nodeId) as Array<{ id: string }>;
  expect(childNodes.length).toBeGreaterThan(0);
});

it('does not recreate a deleted readwise book node when re-import is triggered', async () => {
  const { fullDocumentDir, highlightDir } = await createBooksFixture();
  await scanBooksFixture({ fullDocumentDir, highlightDir });
  const nodeId = seedManualBookPlaceholder();

  softDeleteNodes({
    deletedAt: '2026-04-04T11:00:00.000Z',
    nodeIds: [nodeId]
  });

  const resetResult = await resetReadwiseBookImport(nodeId);
  expect(resetResult).toMatchObject({
    node_id: null,
    status: 'book_not_found'
  });

  const deletedNode = openDatabaseConnection().sqlite
    .prepare('SELECT id, deleted_at, content FROM nodes WHERE id = ?')
    .get(nodeId) as { content: string; deleted_at: string | null; id: string } | undefined;
  expect(deletedNode?.id).toBe(nodeId);
  expect(deletedNode?.deleted_at).toBe('2026-04-04T11:00:00.000Z');
  expect(deletedNode?.content).toBe('# Manual Book\n\nWaiting for EPUB.');
  expect(listRemovedKeepImportItems()).toEqual([]);
});
