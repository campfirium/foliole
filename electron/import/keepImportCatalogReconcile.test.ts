// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-keep-import-catalog-tests';
const { notifyManagedInboxUpdated } = vi.hoisted(() => ({
  notifyManagedInboxUpdated: vi.fn()
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('./managedInboxEvents.js', () => ({
  notifyManagedInboxUpdated
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { saveReadwiseKeepImportSettingsWithScope } from './keepImportReadwiseTestSupport.js';
import { runKeepImportRule } from './keepImportService.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-keep-catalog-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
  notifyManagedInboxUpdated.mockReset();
});

it('keeps a source snapshot catalog row for readwise files that are not imported', async () => {
  const fullDocumentDir = path.join(tempRoot, 'readwise', 'Full Document Contents', 'Articles');
  const highlightDir = path.join(tempRoot, 'readwise', 'Articles');
  await fs.mkdir(fullDocumentDir, { recursive: true });
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.writeFile(path.join(fullDocumentDir, 'Plain Article.md'), '# Plain\nNo highlights yet.\n', 'utf8');
  saveReadwiseKeepImportSettingsWithScope(
    { fullDocumentDir, highlightDir, readwiseRoot: path.join(tempRoot, 'readwise') },
    'highlights_only'
  );

  const firstRun = await runKeepImportRule({
    directoryPath: fullDocumentDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });

  const connection = openDatabaseConnection();
  const catalogRow = connection.sqlite
    .prepare(
      `SELECT last_node_id, last_status, local_node_state, source_state
       FROM keep_import_items
       WHERE rule_id = 'draft-import-source-1' AND source_path = 'Plain Article.md'`
    )
    .get() as { last_node_id: string | null; last_status: string; local_node_state: string; source_state: string };
  const importSourceCount = connection.sqlite
    .prepare(`SELECT COUNT(*) AS count FROM import_sources WHERE source_name = 'Plain Article.md'`)
    .get() as { count: number };

  expect(firstRun).toEqual([expect.objectContaining({ action: 'skipped', sourcePath: 'Plain Article.md' })]);
  expect(catalogRow).toEqual({
    last_node_id: null,
    last_status: 'discovered',
    local_node_state: 'not_imported',
    source_state: 'present'
  });
  expect(
    connection.sqlite
      .prepare(`SELECT title, content FROM keep_import_item_cache WHERE rule_id = ? AND source_path = ?`)
      .get('draft-import-source-1', 'Plain Article.md')
  ).toBeUndefined();
  expect(importSourceCount.count).toBe(0);

  await fs.rm(path.join(fullDocumentDir, 'Plain Article.md'));
  await runKeepImportRule({
    directoryPath: fullDocumentDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });

  const missingRow = connection.sqlite
    .prepare(
      `SELECT source_state
       FROM keep_import_items
       WHERE rule_id = 'draft-import-source-1' AND source_path = 'Plain Article.md'`
    )
    .get() as { source_state: string };

  expect(missingRow.source_state).toBe('missing');
});
