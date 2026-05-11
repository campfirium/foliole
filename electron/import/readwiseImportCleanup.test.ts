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

it('keeps changed Readwise topics and removes their import tracking', async () => {
  const nodeId = await importReadwiseFixture();
  openDatabaseConnection().sqlite
    .prepare('UPDATE nodes SET content = ?, updated_at = ? WHERE id = ?')
    .run('User changed body', '2026-05-11T08:00:00.000Z', nodeId);

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
  expect(readRows('SELECT id, content FROM nodes WHERE id = ?', nodeId)).toEqual([
    { content: 'User changed body', id: nodeId }
  ]);
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
    total_count: 1
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
