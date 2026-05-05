// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-keep-import-existing-update-tests';
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
import { runKeepImportRule } from './keepImportService.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-keep-import-existing-update-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
  notifyManagedInboxUpdated.mockReset();
});

it('notifies the renderer and keeps the existing node unchanged when an existing keep source changes', async () => {
  const fixture = await seedReadwiseArticleFixture(tempRoot);
  saveReadwiseKeepImportSettings(fixture);

  await runKeepImportRule({
    directoryPath: fixture.fullDocumentDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });
  notifyManagedInboxUpdated.mockReset();

  const connection = openDatabaseConnection();
  const importedNode = connection.sqlite
    .prepare(`SELECT latest_node_id FROM import_sources WHERE source_name = 'Sample Article.md'`)
    .get() as { latest_node_id: string };
  const nodeBefore = connection.sqlite
    .prepare('SELECT content, updated_at FROM nodes WHERE id = ?')
    .get(importedNode.latest_node_id) as { content: string; updated_at: string };
  const importCountBefore = connection.sqlite
    .prepare(`SELECT COUNT(*) AS count FROM import_runs WHERE source_name = 'Sample Article.md'`)
    .get() as { count: number };

  await fs.writeFile(
    path.join(fixture.highlightDir, 'Sample Article.md'),
    [
      '# Sample Article',
      '',
      '## Highlights',
      'This is the highlighted sentence. [...] (https://example.com)',
      '',
      'Another matching excerpt. Tags: [[tag-a]] [[tag-b]]',
      '',
      'After the quote.'
    ].join('\n'),
    'utf8'
  );

  await runKeepImportRule({
    directoryPath: fixture.fullDocumentDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });

  const nodeAfter = connection.sqlite
    .prepare('SELECT content, updated_at FROM nodes WHERE id = ?')
    .get(importedNode.latest_node_id) as { content: string; updated_at: string };
  const keepItem = connection.sqlite
    .prepare(
      `SELECT has_source_update
       FROM keep_import_items
       WHERE rule_id = 'draft-import-source-1' AND source_path = 'Sample Article.md'`
    )
    .get() as { has_source_update: number };
  const importCountAfter = connection.sqlite
    .prepare(`SELECT COUNT(*) AS count FROM import_runs WHERE source_name = 'Sample Article.md'`)
    .get() as { count: number };

  expect(nodeAfter).toEqual(nodeBefore);
  expect(importCountAfter.count).toBe(importCountBefore.count);
  expect(keepItem.has_source_update).toBe(1);
  expect(notifyManagedInboxUpdated).toHaveBeenCalledTimes(1);
  expect(notifyManagedInboxUpdated).toHaveBeenCalledWith('keep-update-draft-import-source-1-Sample Article.md');
});
