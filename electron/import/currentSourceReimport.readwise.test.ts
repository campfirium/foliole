// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-current-source-reimport-readwise-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('./managedInboxEvents.js', () => ({
  notifyManagedInboxUpdated: vi.fn()
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { reimportCurrentTopicSource } from './currentSourceReimport.js';
import { saveImportManagerSettings } from './importManagerSettings.js';
import { runKeepImportRule } from './keepImportService.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-current-source-reimport-readwise-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function saveReadwiseKeepSettings(primaryDir: string, highlightDir: string) {
  saveImportManagerSettings({
    readwiseReaderConfig: {
      enabled: true,
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      validatedAt: '2026-05-18T00:00:00.000Z',
      withHighlightsDestination: 'inbox',
      withoutHighlightsDestination: 'off'
    },
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: highlightDir,
        id: 'draft-readwise-source-401',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'articles',
        primaryPath: primaryDir
      }
    ]
  });
}

it('rebuilds readwise article content and replaces imported child highlights', async () => {
  const primaryDir = path.join(tempRoot, 'readwise', 'Full Document Contents', 'Articles');
  const highlightDir = path.join(tempRoot, 'readwise', 'Articles');
  await fs.mkdir(primaryDir, { recursive: true });
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.writeFile(path.join(primaryDir, 'entry.md'), '# Entry\n\nSource body.\n', 'utf8');
  await fs.writeFile(path.join(highlightDir, 'entry.md'), '# Entry\n\n## Highlights\nSource body.\n', 'utf8');
  saveReadwiseKeepSettings(primaryDir, highlightDir);

  await runKeepImportRule({
    directoryPath: primaryDir,
    highlightPolicy: 'adopt',
    ruleId: 'draft-readwise-source-401',
    sourceType: 'readwise'
  });

  const connection = openDatabaseConnection();
  const first = connection.sqlite
    .prepare(`SELECT last_node_id FROM keep_import_items WHERE rule_id = ? AND source_path = ?`)
    .get('draft-readwise-source-401', 'entry.md') as { last_node_id: string };
  connection.sqlite
    .prepare('UPDATE nodes SET content = ?, updated_at = ? WHERE id = ?')
    .run('# Entry\n\nEdited in app.\n', new Date().toISOString(), first.last_node_id);
  insertImportedChild(first.last_node_id, 'node-stale-imported-highlight', JSON.stringify({
    id: 'stale-anchor',
    kind: 'highlight',
    origin: 'imported'
  }));
  insertImportedChild(first.last_node_id, 'node-legacy-imported-highlight', JSON.stringify({
    id: 'imported-highlight-legacy',
    kind: 'highlight',
    locator: { from: 0, originalText: 'legacy', to: 6 }
  }));

  await expect(reimportCurrentTopicSource(first.last_node_id)).resolves.toMatchObject({
    node_id: first.last_node_id,
    status: 'reimported'
  });
  await expect(reimportCurrentTopicSource(first.last_node_id)).resolves.toMatchObject({
    node_id: first.last_node_id,
    status: 'reimported'
  });

  const node = connection.sqlite
    .prepare('SELECT content FROM nodes WHERE id = ?')
    .get(first.last_node_id) as { content: string };
  const importedChildren = connection.sqlite
    .prepare(
      `SELECT content, title
       FROM nodes
       WHERE parent_id = ?
         AND anchor_link LIKE '%"origin":"imported"%'
       ORDER BY created_at ASC`
    )
    .all(first.last_node_id);

  expect(node.content).toBe('# Entry\n\n## Entry\n\nSource body.');
  expect(importedChildren).toHaveLength(1);
  expect(importedChildren[0]).toMatchObject({
    content: 'Source body.',
    title: 'Source body.'
  });
});

function insertImportedChild(parentNodeId: string, nodeId: string, anchorLink: string) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO nodes (id, parent_id, kind, title, content, anchor_link, created_at, updated_at)
       VALUES (?, ?, 'topic', 'Image highlight', 'stale', ?, ?, ?)`
    )
    .run(nodeId, parentNodeId, anchorLink, '2026-05-18T00:00:00.000Z', '2026-05-18T00:00:00.000Z');
}
