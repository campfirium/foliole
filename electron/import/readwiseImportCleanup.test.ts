// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-cleanup-tests';

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
import {
  previewReadwiseImportCleanup,
  runReadwiseImportCleanup
} from './readwiseImportCleanup.js';
import { runReadwiseReaderImport } from './readwiseReaderImportRun.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-cleanup-'));
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

function readRows<T>(sql: string, ...params: unknown[]) {
  return openDatabaseConnection().sqlite.prepare(sql).all(...params) as T[];
}

function addMilliseconds(timestamp: string, milliseconds: number) {
  return new Date(new Date(timestamp).getTime() + milliseconds).toISOString();
}

async function importReadwiseFixture() {
  const fixture = await seedReadwiseFixture();
  saveReadwiseSettings(fixture);
  await runReadwiseReaderImport();
  const row = openDatabaseConnection().sqlite
    .prepare('SELECT last_node_id AS node_id FROM keep_import_items')
    .get() as { node_id: string };
  return row.node_id;
}

it('deletes unchanged Readwise import topics and tracking rows', async () => {
  const nodeId = await importReadwiseFixture();

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
  expect(readRows('SELECT * FROM keep_import_items')).toEqual([]);
  expect(readRows('SELECT * FROM import_sources')).toEqual([]);
  expect(readRows('SELECT * FROM import_runs')).toEqual([]);
  expect(nodeId).toBeTruthy();
});

it('deletes unchanged topics after import tracking advances without rewriting the topic', async () => {
  const nodeId = await importReadwiseFixture();
  openDatabaseConnection().sqlite
    .prepare('UPDATE keep_import_items SET last_imported_at = ?, last_seen_at = ? WHERE last_node_id = ?')
    .run('2999-01-01T00:00:00.000Z', '2999-01-01T00:00:00.000Z', nodeId);

  expect(previewReadwiseImportCleanup()).toMatchObject({
    delete_count: 1,
    keep_count: 0,
    total_count: 1
  });
});

it('deletes topics with timestamp drift inside the import tolerance', async () => {
  const nodeId = await importReadwiseFixture();
  const keepItem = openDatabaseConnection().sqlite
    .prepare('SELECT last_imported_at FROM keep_import_items WHERE last_node_id = ?')
    .get(nodeId) as { last_imported_at: string };
  openDatabaseConnection().sqlite
    .prepare('UPDATE nodes SET updated_at = ? WHERE id = ?')
    .run(addMilliseconds(keepItem.last_imported_at, 999), nodeId);

  expect(previewReadwiseImportCleanup()).toMatchObject({
    delete_count: 1,
    keep_count: 0,
    total_count: 1
  });
});

it('deletes changed Readwise topics and removes their import tracking', async () => {
  const nodeId = await importReadwiseFixture();
  const keepItem = openDatabaseConnection().sqlite
    .prepare('SELECT last_imported_at FROM keep_import_items WHERE last_node_id = ?')
    .get(nodeId) as { last_imported_at: string };
  openDatabaseConnection().sqlite
    .prepare('UPDATE nodes SET content = ?, updated_at = ? WHERE id = ?')
    .run('User changed body', addMilliseconds(keepItem.last_imported_at, 1001), nodeId);

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
  expect(readRows('SELECT * FROM keep_import_items')).toEqual([]);
  expect(readRows('SELECT * FROM import_sources')).toEqual([]);
  expect(readRows('SELECT * FROM import_runs')).toEqual([]);
});

it('removes Readwise-managed External documents and sync rows', async () => {
  const fixture = await seedReadwiseFixture();
  saveReadwiseSettings(fixture, { withHighlightsDestination: 'external', withoutHighlightsDestination: 'off' });
  await runReadwiseReaderImport();

  expect(readRows('SELECT document_id FROM external_documents')).toEqual([
    { document_id: 'readwise-reader-import-articles:Plain.md' }
  ]);
  expect(previewReadwiseImportCleanup()).toMatchObject({
    external_document_count: 1,
    external_folder_count: 1,
    total_count: 2,
    tracking_only_count: 1
  });
  const result = runReadwiseImportCleanup();

  expect(result).toMatchObject({
    external_deleted_count: 1,
    status: 'completed'
  });
  expect(readRows('SELECT document_id FROM external_documents')).toEqual([]);
  expect(readRows('SELECT * FROM keep_import_items')).toEqual([]);
  expect(readRows("SELECT object_id FROM sync_object_state WHERE object_type = 'external_document'")).toEqual([]);
});

it('clears Readwise Books placeholders and tracking-only records', async () => {
  const fixture = await seedReadwiseFixture();
  saveReadwiseSettings(fixture);
  const connection = openDatabaseConnection().sqlite;
  connection
    .prepare(
      `INSERT INTO keep_import_items (
        rule_id, source_path, source_mtime_ms, source_size_bytes, has_source_update,
        last_node_id, last_status, first_seen_at, last_seen_at, last_imported_at
      ) VALUES (?, ?, 1, 1, 0, NULL, 'imported', ?, ?, ?)`
    )
    .run('draft-import-source-1', 'Tracking only.md', '2026-05-11T00:00:00.000Z', '2026-05-11T00:00:00.000Z', '2026-05-11T00:00:00.000Z');
  connection
    .prepare(
      `INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
       VALUES ('node-readwise-book-placeholder', 'special-inbox', 'topic', 'Readwise Book', '# Readwise Book', ?, ?)`
    )
    .run('2026-05-11T00:00:00.000Z', '2026-05-11T00:00:00.000Z');
  connection
    .prepare("INSERT INTO node_order (node_id, position) VALUES ('node-readwise-book-placeholder', 0)")
    .run();

  expect(previewReadwiseImportCleanup()).toMatchObject({
    delete_count: 1,
    tracking_only_count: 1,
    total_count: 2
  });
  runReadwiseImportCleanup();

  expect(readRows("SELECT id FROM nodes WHERE id = 'node-readwise-book-placeholder'")).toEqual([]);
  expect(readRows('SELECT * FROM keep_import_items')).toEqual([]);
});

it('clears tracking for Readwise topics already deleted from the active node tree', async () => {
  const fixture = await seedReadwiseFixture();
  saveReadwiseSettings(fixture);
  await runReadwiseReaderImport();
  const nodeId = readRows<{ last_node_id: string }>('SELECT last_node_id FROM keep_import_items')[0]?.last_node_id;
  openDatabaseConnection().sqlite
    .prepare("UPDATE nodes SET deleted_at = '2026-05-17T03:35:11.415Z' WHERE id = ?")
    .run(nodeId);

  expect(previewReadwiseImportCleanup()).toMatchObject({ keep_count: 1, total_count: 1 });
  runReadwiseImportCleanup();

  expect(readRows('SELECT * FROM keep_import_items')).toEqual([]);
});
