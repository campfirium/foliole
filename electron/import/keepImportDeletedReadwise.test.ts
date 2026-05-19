// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-keep-import-deleted-readwise-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { softDeleteNodes } from '../database/nodeMutations.js';

import {
  saveReadwiseKeepImportSettings,
  seedReadwiseArticleFixture
} from './keepImportReadwiseTestSupport.js';
import { previewKeepImportRule, runKeepImportRule } from './keepImportService.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-keep-import-deleted-readwise-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('blocks automatic Readwise import recreation after the previous node was deleted', async () => {
  const fixture = await seedReadwiseArticleFixture(tempRoot);
  saveReadwiseKeepImportSettings(fixture);
  const config = {
    directoryPath: fixture.fullDocumentDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  } as const;

  await runKeepImportRule(config);
  const importedNode = openDatabaseConnection().sqlite
    .prepare(`SELECT last_node_id FROM keep_import_items WHERE rule_id = ? AND source_path = ?`)
    .get('draft-import-source-1', 'Sample Article.md') as { last_node_id: string };

  softDeleteNodes({
    deletedAt: '2026-03-25T00:10:00.000Z',
    nodeIds: [importedNode.last_node_id]
  });

  const preview = await previewKeepImportRule(config);
  expect(preview.entries).toEqual([
    expect.objectContaining({
      detail: 'This source was deleted in Foliole and will stay blocked until you import it again manually.',
      source_path: 'Sample Article.md',
      status: 'blocked_deleted'
    })
  ]);

  await runKeepImportRule(config);

  const nodeRows = openDatabaseConnection().sqlite
    .prepare(`SELECT id, deleted_at FROM nodes WHERE title = 'Sample Article' ORDER BY created_at ASC`)
    .all() as Array<{ deleted_at: string | null; id: string }>;
  const keepItem = openDatabaseConnection().sqlite
    .prepare(
      `SELECT has_source_update, last_status, last_node_id, local_node_state, source_state
       FROM keep_import_items
       WHERE rule_id = 'draft-import-source-1' AND source_path = 'Sample Article.md'`
    )
    .get() as { has_source_update: number; last_node_id: string; last_status: string; local_node_state: string; source_state: string };

  expect(nodeRows).toHaveLength(1);
  expect(nodeRows[0]?.id).toBe(importedNode.last_node_id);
  expect(nodeRows[0]?.deleted_at).toBe('2026-03-25T00:10:00.000Z');
  expect(keepItem).toEqual({
    has_source_update: 0,
    last_node_id: importedNode.last_node_id,
    last_status: 'blocked_deleted',
    local_node_state: 'locally_deleted',
    source_state: 'present'
  });
});
