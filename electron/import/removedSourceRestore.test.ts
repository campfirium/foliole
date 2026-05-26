// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-removed-import-restore-tests';
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
import { deleteNodesPermanently } from '../database/nodeMutations.js';
import { loadRemovedSources } from '../ipc/removedSourcesPayload.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { runKeepImportRule } from './keepImportService.js';
import { runReadwiseReaderImport } from './readwiseReaderImportRun.js';
import { restoreRemovedSource } from './removedSourceRestore.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-removed-import-restore-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
  notifyManagedInboxUpdated.mockReset();
});

function saveGenericKeepSettings(sourceDir: string) {
  saveImportManagerSettings({
    sources: [
      {
        actionMode: 'keep',
        archivePath: '',
        highlightMode: 'merged',
        highlightPath: '',
        id: 'draft-import-source-301',
        keepPreview: null,
        keepState: 'enabled',
        primaryPath: sourceDir
      }
    ]
  });
}

function saveReadwiseSettings(paths: { fullDocumentDir: string; highlightDir: string; readwiseRoot: string }) {
  saveImportManagerSettings({
    readwiseReaderConfig: {
      enabled: true,
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      validatedAt: '2026-05-11T00:00:00.000Z',
      withHighlightsDestination: 'inbox',
      withoutHighlightsDestination: 'inbox'
    },
    readwiseRootPath: paths.readwiseRoot,
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: paths.highlightDir,
        id: 'draft-import-source-readwise',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'articles',
        primaryPath: paths.fullDocumentDir
      }
    ]
  });
}

async function seedReadwiseFixture() {
  const readwiseRoot = path.join(tempRoot, 'Readwise');
  const fullDocumentDir = path.join(readwiseRoot, 'Full Document Contents', 'Articles');
  const highlightDir = path.join(readwiseRoot, 'Articles');
  await fs.mkdir(fullDocumentDir, { recursive: true });
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.writeFile(
    path.join(fullDocumentDir, 'Plain.md'),
    [
      '# Plain Title',
      '',
      '## Metadata',
      '- Author: Reader',
      '- URL: https://example.com/plain',
      '',
      '## Full Document',
      'Plain body from Readwise.'
    ].join('\n'),
    'utf8'
  );
  return { fullDocumentDir, highlightDir, readwiseRoot };
}

async function expectRemovedSourceUsesCachedContent(sourceDir: string) {
  expect((await loadRemovedSources()).entries).toEqual([
    expect.objectContaining({
      content: '# Entry\n\n![Cover](data:image/png;base64,cG5n)\n\nFresh body\n',
      content_preview: 'Fresh body',
      source_path: 'entry.md',
      title: 'Entry'
    })
  ]);
  await fs.rm(path.join(sourceDir, 'entry.md'));
  expect((await loadRemovedSources()).entries).toEqual([
    expect.objectContaining({
      content: '# Entry\n\n![Cover](data:image/png;base64,cG5n)\n\nFresh body\n',
      source_path: 'entry.md',
      title: 'Entry'
    })
  ]);
  expect(
    openDatabaseConnection().sqlite
      .prepare(`SELECT title, content FROM keep_import_item_cache WHERE rule_id = ? AND source_path = ?`)
      .get('draft-import-source-301', 'entry.md')
  ).toMatchObject({
    content: '# Entry\n\n![Cover](data:image/png;base64,cG5n)\n\nFresh body\n',
    title: 'Entry'
  });
  await fs.writeFile(path.join(sourceDir, 'entry.md'), '# Entry\n\n![Cover](images/cover.png)\n\nFresh body\n', 'utf8');
}

function replaceReadwiseRemovedCacheWithStaleContent() {
  openDatabaseConnection().sqlite.prepare(
    `UPDATE keep_import_item_cache
     SET content = ?, content_preview = ?
     WHERE rule_id = ? AND source_path = ?`
  ).run(
    '# Stale Cache\n\nStale cache body.',
    '# Stale Cache\n\nStale cache body.',
    'draft-import-source-readwise',
    'Plain.md'
  );
}

it('restores a removed import by importing a fresh initial topic', async () => {
  const sourceDir = path.join(tempRoot, 'watch');
  const imageDir = path.join(sourceDir, 'images');
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(imageDir, { recursive: true });
  await fs.writeFile(path.join(imageDir, 'cover.png'), 'png', 'utf8');
  await fs.writeFile(path.join(sourceDir, 'entry.md'), '# Entry\n\n![Cover](images/cover.png)\n\nFresh body\n', 'utf8');
  saveGenericKeepSettings(sourceDir);
  await runKeepImportRule({
    directoryPath: sourceDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-301'
  });
  const firstRow = openDatabaseConnection().sqlite
    .prepare(`SELECT last_node_id FROM keep_import_items WHERE rule_id = ? AND source_path = ?`)
    .get('draft-import-source-301', 'entry.md') as { last_node_id: string };
  const nodeOrder = openDatabaseConnection().sqlite
    .prepare(`SELECT node_id FROM node_order ORDER BY position ASC`)
    .all() as Array<{ node_id: string }>;
  deleteNodesPermanently({
    nodeIds: [firstRow.last_node_id],
    nodeOrder: nodeOrder.map((row) => row.node_id)
  });

  await expectRemovedSourceUsesCachedContent(sourceDir);

  const result = await restoreRemovedSource('draft-import-source-301', 'entry.md');

  expect(result).toMatchObject({ status: 'restored' });
  expect(result.node_id).toEqual(expect.any(String));
  expect(result.node_id).not.toBe(firstRow.last_node_id);
  expect(
    openDatabaseConnection().sqlite
      .prepare(`SELECT local_node_state, last_status, last_node_id FROM keep_import_items WHERE source_path = ?`)
      .get('entry.md')
  ).toMatchObject({
    last_node_id: result.node_id,
    last_status: 'imported',
    local_node_state: 'active'
  });
});

it('re-imports a removed Readwise source through the Readwise pipeline', async () => {
  const fixture = await seedReadwiseFixture();
  saveReadwiseSettings(fixture);
  await runReadwiseReaderImport();
  const firstRow = openDatabaseConnection().sqlite
    .prepare(`SELECT last_node_id FROM keep_import_items WHERE rule_id = ? AND source_path = ?`)
    .get('draft-import-source-readwise', 'Plain.md') as { last_node_id: string };
  const nodeOrder = openDatabaseConnection().sqlite
    .prepare(`SELECT node_id FROM node_order ORDER BY position ASC`)
    .all() as Array<{ node_id: string }>;
  deleteNodesPermanently({
    nodeIds: [firstRow.last_node_id],
    nodeOrder: nodeOrder.map((row) => row.node_id)
  });
  replaceReadwiseRemovedCacheWithStaleContent();
  const removedEntry = (await loadRemovedSources()).entries.find((entry) => entry.source_path === 'Plain.md');
  expect(removedEntry?.content).toContain('Plain body from Readwise.');
  expect(removedEntry?.content).not.toContain('Stale cache body.');
  expect(removedEntry?.content).not.toContain('## Metadata');
  expect(removedEntry?.content).not.toContain('## Full Document');

  const result = await restoreRemovedSource('draft-import-source-readwise', 'Plain.md');
  const importedNode = openDatabaseConnection().sqlite
    .prepare(`SELECT content FROM nodes WHERE id = ?`)
    .get(result.node_id) as { content: string } | undefined;

  expect(result).toMatchObject({ status: 'restored' });
  expect(result.node_id).toEqual(expect.any(String));
  expect(result.node_id).not.toBe(firstRow.last_node_id);
  expect(importedNode?.content).toContain('Plain body from Readwise.');
  expect(importedNode?.content).toContain('author: Reader');
  expect(importedNode?.content).not.toContain('## Metadata');
  expect(importedNode?.content).not.toContain('## Full Document');
  expect(
    openDatabaseConnection().sqlite
      .prepare(`SELECT local_node_state, last_status, last_node_id FROM keep_import_items WHERE source_path = ?`)
      .get('Plain.md')
  ).toMatchObject({
    last_node_id: result.node_id,
    last_status: 'imported',
    local_node_state: 'active'
  });
});
