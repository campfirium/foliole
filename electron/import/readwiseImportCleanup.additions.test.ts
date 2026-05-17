// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-cleanup-additions-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('./managedInboxEvents.js', () => ({
  notifyManagedInboxUpdated: vi.fn()
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { previewReadwiseImportCleanup, runReadwiseImportCleanup } from './readwiseImportCleanup.js';
import { runReadwiseReaderImport } from './readwiseReaderImportRun.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-cleanup-additions-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function seedReadwiseFixture() {
  const fullDocumentDir = path.join(tempRoot, 'readwise', 'Full Document Contents', 'Articles');
  const highlightDir = path.join(tempRoot, 'readwise', 'Articles');
  await fs.mkdir(fullDocumentDir, { recursive: true });
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.writeFile(path.join(fullDocumentDir, 'Plain.md'), '# Plain\n\nPlain body.\n', 'utf8');
  await fs.writeFile(path.join(highlightDir, 'Plain.md'), '# Plain\n\n## Highlights\nPlain body.\n', 'utf8');
  return { fullDocumentDir, highlightDir, readwiseRoot: path.join(tempRoot, 'readwise') };
}

function saveReadwiseSettings(
  paths: Awaited<ReturnType<typeof seedReadwiseFixture>>,
  behavior: {
    withHighlightsDestination: 'external' | 'inbox';
    withoutHighlightsDestination: 'external' | 'inbox' | 'off';
  } = { withHighlightsDestination: 'inbox', withoutHighlightsDestination: 'off' }
) {
  saveImportManagerSettings({
    readwiseReaderConfig: {
      enabled: true,
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      validatedAt: '2026-05-11T00:00:00.000Z',
      ...behavior
    },
    readwiseRootPath: paths.readwiseRoot,
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: paths.highlightDir,
        id: 'draft-import-source-1',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'articles',
        primaryPath: paths.fullDocumentDir
      }
    ]
  });
}

function addMilliseconds(timestamp: string, milliseconds: number) {
  return new Date(new Date(timestamp).getTime() + milliseconds).toISOString();
}

function readRows<T>(sql: string, ...params: unknown[]) {
  return openDatabaseConnection().sqlite.prepare(sql).all(...params) as T[];
}

async function importReadwiseFixture() {
  const fixture = await seedReadwiseFixture();
  saveReadwiseSettings(fixture);
  await runReadwiseReaderImport();
  const row = openDatabaseConnection().sqlite
    .prepare('SELECT last_node_id AS node_id, last_imported_at AS imported_at FROM keep_import_items')
    .get() as { imported_at: string; node_id: string };
  return row;
}

function insertNode(
  id: string,
  parentId: string | null,
  title: string,
  timestamp: string,
  anchorLink: string | null = null
) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO nodes (id, parent_id, kind, title, content, anchor_link, created_at, updated_at)
       VALUES (?, ?, 'topic', ?, ?, ?, ?, ?)`
    )
    .run(id, parentId, title, `# ${title}`, anchorLink, timestamp, timestamp);
}

it('keeps a newly added non-imported child topic after import', async () => {
  const { imported_at: importedAt, node_id: nodeId } = await importReadwiseFixture();
  insertNode('node-added-1', nodeId, 'Added topic', addMilliseconds(importedAt, 1001));

  expect(previewReadwiseImportCleanup()).toMatchObject({
    delete_count: 0,
    keep_count: 1,
    total_count: 1
  });
  const result = runReadwiseImportCleanup();

  expect(result).toMatchObject({
    deleted_count: 0,
    detached_count: 1,
    status: 'completed'
  });
  expect(readRows('SELECT id FROM nodes WHERE id = ?', 'node-added-1')).toEqual([
    { id: 'node-added-1' }
  ]);
  expect(readRows('SELECT last_node_id FROM keep_import_items')).toEqual([
    { last_node_id: nodeId }
  ]);
});

it('does not keep an imported-derived child topic created after import', async () => {
  const { imported_at: importedAt, node_id: nodeId } = await importReadwiseFixture();
  insertNode(
    'node-imported-derived-1',
    nodeId,
    'Imported derived topic',
    addMilliseconds(importedAt, 1001),
    JSON.stringify({ id: 'anchor-1', kind: 'highlight', origin: 'imported' })
  );

  expect(previewReadwiseImportCleanup()).toMatchObject({
    delete_count: 1,
    keep_count: 0,
    total_count: 1
  });
  const result = runReadwiseImportCleanup();

  expect(result).toMatchObject({
    deleted_count: 1,
    detached_count: 0,
    status: 'completed'
  });
  expect(readRows('SELECT id FROM nodes WHERE id = ?', 'node-imported-derived-1')).toEqual([]);
});

it('does not keep additions created inside the import tolerance window', async () => {
  const { imported_at: importedAt, node_id: nodeId } = await importReadwiseFixture();
  insertNode('node-tolerated-1', nodeId, 'Tolerated topic', addMilliseconds(importedAt, 999));

  expect(previewReadwiseImportCleanup()).toMatchObject({
    delete_count: 1,
    keep_count: 0,
    total_count: 1
  });
});

it('does not keep root timestamp changes or learning state without additions', async () => {
  const { imported_at: importedAt, node_id: nodeId } = await importReadwiseFixture();
  openDatabaseConnection().sqlite
    .prepare('UPDATE nodes SET updated_at = ? WHERE id = ?')
    .run(addMilliseconds(importedAt, 1001), nodeId);
  openDatabaseConnection().sqlite
    .prepare('INSERT INTO node_review (node_id, due) VALUES (?, ?)')
    .run(nodeId, addMilliseconds(importedAt, 2000));
  openDatabaseConnection().sqlite
    .prepare('INSERT INTO node_reading (node_id, last_handled_at, next_at, state) VALUES (?, ?, ?, ?)')
    .run(nodeId, importedAt, importedAt, 'active');

  expect(previewReadwiseImportCleanup()).toMatchObject({
    delete_count: 1,
    keep_count: 0,
    total_count: 1
  });
  const result = runReadwiseImportCleanup();

  expect(result).toMatchObject({
    deleted_count: 1,
    detached_count: 0,
    status: 'completed'
  });
  expect(readRows('SELECT id FROM nodes WHERE id = ?', nodeId)).toEqual([]);
});
