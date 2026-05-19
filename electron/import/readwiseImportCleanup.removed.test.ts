// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-cleanup-removed-tests';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-cleanup-removed-'));
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
  saveImportManagerSettings({
    readwiseReaderConfig: { enabled: true, highlightsHeading: '## Highlights', importScope: 'highlights_only' },
    readwiseRootPath: path.join(tempRoot, 'readwise'),
    readwiseSources: [{
      highlightMode: 'split',
      highlightPath: highlightDir,
      id: 'draft-import-source-1',
      keepPreview: null,
      keepState: 'enabled',
      kind: 'articles',
      primaryPath: fullDocumentDir
    }]
  });
}

function readRows<T>(sql: string, ...params: unknown[]) {
  return openDatabaseConnection().sqlite.prepare(sql).all(...params) as T[];
}

it('clears Readwise Books placeholders and tracking-only records', async () => {
  await seedReadwiseFixture();
  const connection = openDatabaseConnection().sqlite;
  connection.prepare(
    `INSERT INTO keep_import_items (
       rule_id, source_path, source_mtime_ms, source_size_bytes, has_source_update,
       last_node_id, last_status, first_seen_at, last_seen_at, last_imported_at
     ) VALUES (?, ?, 1, 1, 0, NULL, 'imported', ?, ?, ?)`
  ).run('draft-import-source-1', 'Tracking only.md', '2026-05-11T00:00:00.000Z', '2026-05-11T00:00:00.000Z', '2026-05-11T00:00:00.000Z');
  connection.prepare(
    `INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
     VALUES ('node-readwise-book-placeholder', 'special-inbox', 'topic', 'Readwise Book', '# Readwise Book', ?, ?)`
  ).run('2026-05-11T00:00:00.000Z', '2026-05-11T00:00:00.000Z');
  connection.prepare("INSERT INTO node_order (node_id, position) VALUES ('node-readwise-book-placeholder', 0)").run();

  expect(previewReadwiseImportCleanup()).toMatchObject({ delete_count: 1, tracking_only_count: 1, total_count: 2 });
  runReadwiseImportCleanup();

  expect(readRows("SELECT id FROM nodes WHERE id = 'node-readwise-book-placeholder'")).toEqual([]);
  expect(readRows('SELECT * FROM keep_import_items')).toEqual([]);
});

it('keeps tracking for Readwise topics already deleted from the active node tree', async () => {
  await seedReadwiseFixture();
  await runReadwiseReaderImport();
  const nodeId = readRows<{ last_node_id: string }>('SELECT last_node_id FROM keep_import_items')[0]?.last_node_id;
  openDatabaseConnection().sqlite
    .prepare("UPDATE nodes SET deleted_at = '2026-05-17T03:35:11.415Z' WHERE id = ?")
    .run(nodeId);

  expect(previewReadwiseImportCleanup()).toMatchObject({ keep_count: 1, total_count: 1 });
  runReadwiseImportCleanup();

  expect(readRows<{ last_node_id: string }>('SELECT last_node_id FROM keep_import_items')).toEqual([{ last_node_id: nodeId }]);
});
