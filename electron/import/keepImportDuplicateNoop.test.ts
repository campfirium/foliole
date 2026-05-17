// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-keep-import-duplicate-noop-tests';
const { notifyManagedInboxUpdated } = vi.hoisted(() => ({
  notifyManagedInboxUpdated: vi.fn()
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('./managedInboxEvents.js', () => ({
  notifyManagedInboxUpdated
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { saveReadwiseKeepImportSettings, seedReadwiseArticleFixture } from './keepImportReadwiseTestSupport.js';
import { runSingleKeepImportSource } from './keepImportRunSource.js';
import { runKeepImportRule } from './keepImportService.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-keep-import-duplicate-noop-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
  notifyManagedInboxUpdated.mockReset();
});

function createReadwiseConfig(fullDocumentDir: string) {
  return {
    directoryPath: fullDocumentDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  } as const;
}

it('keeps automatic duplicate Readwise imports as no-op without refreshing sync state', async () => {
  const fixture = await seedReadwiseArticleFixture(tempRoot);
  saveReadwiseKeepImportSettings(fixture);
  const config = createReadwiseConfig(fixture.fullDocumentDir);

  await runKeepImportRule(config);
  const connection = openDatabaseConnection().sqlite;
  const sourceBefore = connection
    .prepare(
      `SELECT last_imported_at
       FROM import_sources
       WHERE source_name = 'Sample Article.md'`
    )
    .get() as { last_imported_at: string };
  const importCountBefore = connection
    .prepare(`SELECT COUNT(*) AS count FROM import_runs WHERE source_name = 'Sample Article.md'`)
    .get() as { count: number };
  connection.prepare("DELETE FROM keep_import_items WHERE source_path = 'Sample Article.md'").run();
  connection.prepare("DELETE FROM sync_object_state WHERE object_type = 'import_source'").run();

  const result = await runKeepImportRule(config);
  const sourceAfter = connection
    .prepare(
      `SELECT last_imported_at
       FROM import_sources
       WHERE source_name = 'Sample Article.md'`
    )
    .get() as { last_imported_at: string };
  const importCountAfter = connection
    .prepare(`SELECT COUNT(*) AS count FROM import_runs WHERE source_name = 'Sample Article.md'`)
    .get() as { count: number };
  const syncRows = connection
    .prepare("SELECT object_id FROM sync_object_state WHERE object_type = 'import_source'")
    .all();

  expect(result).toEqual([expect.objectContaining({ action: 'skipped', importStatus: null })]);
  expect(importCountAfter.count).toBe(importCountBefore.count);
  expect(sourceAfter.last_imported_at).toBe(sourceBefore.last_imported_at);
  expect(syncRows).toEqual([]);
});

it('keeps manual force Readwise duplicate imports traceable', async () => {
  const fixture = await seedReadwiseArticleFixture(tempRoot);
  saveReadwiseKeepImportSettings(fixture);
  const config = createReadwiseConfig(fixture.fullDocumentDir);

  await runKeepImportRule(config);
  const connection = openDatabaseConnection().sqlite;
  connection.prepare("DELETE FROM keep_import_items WHERE source_path = 'Sample Article.md'").run();
  const source = {
    adapterId: 'markdown_directory' as const,
    filePath: path.join(fixture.fullDocumentDir, 'Sample Article.md'),
    kind: 'markdown' as const,
    mtimeMs: 1,
    sizeBytes: 1,
    sourceName: 'Sample Article.md'
  };

  await runSingleKeepImportSource(config, source, { forceTopicImport: true });
  const importRunRows = connection
    .prepare(
      `SELECT duplicate_semantic
       FROM import_runs
       WHERE source_name = 'Sample Article.md'
       ORDER BY imported_at ASC`
    )
    .all() as Array<{ duplicate_semantic: string }>;

  expect(importRunRows).toEqual([{ duplicate_semantic: 'new' }, { duplicate_semantic: 'duplicate' }]);
});
