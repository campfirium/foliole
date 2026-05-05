// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-source-update-preview-tests';
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

import { saveImportManagerSettings } from './importManagerSettings.js';
import { saveReadwiseKeepImportSettings, seedReadwiseArticleFixture } from './keepImportReadwiseTestSupport.js';
import { runKeepImportRule } from './keepImportService.js';
import { createGenericKeepImportConfig } from './keepImportService.test-support.js';
import { loadNodeSourceUpdatePreview } from './nodeSourceUpdatePreview.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-source-update-preview-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('returns source update content after the readwise body changes upstream', async () => {
  const fixture = await seedReadwiseArticleFixture(tempRoot);
  saveReadwiseKeepImportSettings(fixture);
  await runKeepImportRule({
    directoryPath: fixture.fullDocumentDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });

  await fs.writeFile(
    path.join(fixture.fullDocumentDir, 'Sample Article.md'),
    [
      '## Metadata',
      '- Author: Someone',
      '',
      '## Full Document',
      'Completely different upstream body.',
      '',
      'Another paragraph with Another matching excerpt. End.'
    ].join('\n'),
    'utf8'
  );
  await runKeepImportRule({
    directoryPath: fixture.fullDocumentDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });

  const importedNode = openDatabaseConnection().sqlite
    .prepare(`SELECT latest_node_id FROM import_sources WHERE source_name = 'Sample Article.md'`)
    .get() as { latest_node_id: string };

  await expect(loadNodeSourceUpdatePreview(importedNode.latest_node_id)).resolves.toEqual({
    checked_at: expect.any(String),
    current_highlight_count: expect.any(Number),
    current_content: expect.stringContaining('This is the highlighted sentence.'),
    source_node_id: importedNode.latest_node_id,
    updated_highlight_count: expect.any(Number),
    updated_content: expect.stringContaining('Completely different upstream body.')
  });
});

it('returns plain markdown updates for generic adopt imports after the source changes', async () => {
  await fs.writeFile(path.join(tempRoot, 'entry.md'), 'Before ==important== after', 'utf8');
  saveImportManagerSettings({
    sources: [
      {
        actionMode: 'keep',
        archivePath: '',
        id: 'draft-import-source-201',
        highlightMode: 'merged',
        highlightPath: '',
        keepPreview: null,
        keepState: 'enabled',
        primaryPath: tempRoot
      }
    ]
  });

  await runKeepImportRule(createGenericKeepImportConfig(tempRoot, 'draft-import-source-201', 'adopt'));
  await fs.writeFile(path.join(tempRoot, 'entry.md'), 'Before ==important== after again', 'utf8');
  await runKeepImportRule(createGenericKeepImportConfig(tempRoot, 'draft-import-source-201', 'adopt'));

  const importedNode = openDatabaseConnection().sqlite
    .prepare(`SELECT latest_node_id FROM import_sources WHERE source_name = 'entry.md'`)
    .get() as { latest_node_id: string };

  await expect(loadNodeSourceUpdatePreview(importedNode.latest_node_id)).resolves.toEqual({
    checked_at: expect.any(String),
    current_highlight_count: 1,
    current_content: 'Before important after',
    source_node_id: importedNode.latest_node_id,
    updated_highlight_count: 1,
    updated_content: 'Before important after again'
  });
});

it('treats legacy inline tags as equivalent to plain markdown during update preview comparison', async () => {
  await fs.writeFile(path.join(tempRoot, 'entry.md'), 'Before ==important== after', 'utf8');

  await runKeepImportRule(createGenericKeepImportConfig(tempRoot, 'draft-import-source-202', 'adopt'));

  const connection = openDatabaseConnection().sqlite;
  const importedNode = connection
    .prepare(`SELECT latest_node_id FROM import_sources WHERE source_name = 'entry.md'`)
    .get() as { latest_node_id: string };

  connection.prepare('UPDATE nodes SET content = ? WHERE id = ?').run(
    'Before <highlight id="legacy-1">important</highlight id="legacy-1"> after',
    importedNode.latest_node_id
  );
  connection.prepare(
    `UPDATE keep_import_items
     SET has_source_update = 1
     WHERE rule_id = 'draft-import-source-202' AND source_path = 'entry.md'`
  ).run();

  await expect(loadNodeSourceUpdatePreview(importedNode.latest_node_id)).resolves.toBeNull();
});
