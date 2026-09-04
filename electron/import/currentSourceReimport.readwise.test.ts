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

import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
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

async function prepareReadwiseArticleFixture() {
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
}

function seedStaleChildren(parentNodeId: string) {
  insertImportedChild(parentNodeId, 'node-stale-imported-highlight', JSON.stringify({
    id: 'stale-anchor',
    kind: 'highlight',
    origin: 'imported'
  }));
  insertImportedChild(parentNodeId, 'node-legacy-imported-highlight', JSON.stringify({
    id: 'imported-highlight-legacy',
    kind: 'highlight',
    locator: { from: 0, originalText: 'legacy', to: 6 }
  }));
  insertGeneratedUnanchoredChild(parentNodeId, 'node-unanchored-imported-highlight');
  insertReadingState('node-unanchored-imported-highlight');
  insertManualChild(parentNodeId, 'node-manual-child');
}

function readKeepImportNodeId() {
  return openDatabaseConnection().sqlite
    .prepare(`SELECT last_node_id FROM keep_import_items WHERE rule_id = ? AND source_path = ?`)
    .get('draft-readwise-source-401', 'entry.md') as { last_node_id: string };
}

it('rebuilds readwise article content and replaces imported child highlights', async () => {
  await prepareReadwiseArticleFixture();

  const connection = openDatabaseConnection();
  const first = readKeepImportNodeId();
  writeNodeBody({
    content: '# Entry\n\nEdited in app.\n',
    driver: connection.driver,
    nodeId: first.last_node_id,
    title: 'Entry',
    updatedAt: new Date().toISOString()
  });
  connection.driver.execute('UPDATE nodes SET content = ? WHERE id = ?', ['', first.last_node_id]);
  seedStaleChildren(first.last_node_id);

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
      `SELECT anchor_link, content, title
       FROM nodes
       WHERE parent_id = ?
       ORDER BY created_at ASC`
    )
    .all(first.last_node_id);

  expect(node.content).toBe('# Entry\n\n## Entry\n\nSource body.');
  expect(importedChildren).toEqual([
    expect.objectContaining({
      anchor_link: null,
      content: 'manual note',
      title: 'Manual child'
    }),
    expect.objectContaining({
      anchor_link: expect.stringContaining('"origin":"imported"'),
      content: 'Source body.',
      title: 'Source body.'
    })
  ]);
});

function insertImportedChild(parentNodeId: string, nodeId: string, anchorLink: string) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO nodes (id, parent_id, kind, title, content, anchor_link, created_at, updated_at)
       VALUES (?, ?, 'topic', 'Image highlight', 'stale', ?, ?, ?)`
    )
    .run(nodeId, parentNodeId, anchorLink, '2026-05-18T00:00:00.000Z', '2026-05-18T00:00:00.000Z');
}

function insertGeneratedUnanchoredChild(parentNodeId: string, nodeId: string) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO nodes (id, parent_id, kind, title, is_title_manual, content, anchor_link, created_at, updated_at)
       VALUES (?, ?, 'topic', 'Generated old highlight', 0, 'stale generated', NULL, ?, ?)`
    )
    .run(nodeId, parentNodeId, '2026-05-18T00:00:00.001Z', '2026-05-18T00:00:00.001Z');
}

function insertManualChild(parentNodeId: string, nodeId: string) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO nodes (id, parent_id, kind, title, is_title_manual, content, anchor_link, created_at, updated_at)
       VALUES (?, ?, 'topic', 'Manual child', 1, 'manual note', NULL, ?, ?)`
    )
    .run(nodeId, parentNodeId, '2026-05-18T00:00:00.002Z', '2026-05-18T00:00:00.002Z');
}

function insertReadingState(nodeId: string) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO node_reading (
        node_id, interval_duration_ms, interval_growth_factor, last_handled_at, next_at,
        priority, repetition_count, state
      ) VALUES (?, 0, 1, ?, ?, 0, 0, 'active')`
    )
    .run(nodeId, '2026-05-18T00:00:00.003Z', '2026-05-18T00:00:00.003Z');
}
