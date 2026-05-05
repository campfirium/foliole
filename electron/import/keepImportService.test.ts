// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
let mockedAppDataDir = '/tmp/foliole-keep-import-tests';
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
import { softDeleteNodes } from '../database/nodeMutations.js';

import {
  readImportedChildRows,
  saveReadwiseKeepImportSettings,
  saveReadwiseKeepImportSettingsWithScope,
  seedReadwiseArticleFixture
} from './keepImportReadwiseTestSupport.js';
import { previewKeepImportRule, runKeepImportRule } from './keepImportService.js';
import { createGenericKeepImportConfig, parseAnchorLink } from './keepImportService.test-support.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-keep-import-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
  notifyManagedInboxUpdated.mockReset();
});

it('recreates a new keep-import node after the previous one was deleted', async () => {
  const sourceDir = path.join(tempRoot, 'sources');
  await fs.mkdir(sourceDir, { recursive: true });
  const filePath = path.join(sourceDir, 'entry.md');

  await fs.writeFile(filePath, '# First import\nBody\n', 'utf8');
  await runKeepImportRule(createGenericKeepImportConfig(sourceDir, 'draft-import-source-101'));

  const connection = openDatabaseConnection();
  const importedNode = connection.sqlite
    .prepare(`SELECT latest_node_id FROM import_sources WHERE source_name = 'entry.md'`)
    .get() as { latest_node_id: string };

  softDeleteNodes({
    deletedAt: '2026-03-25T00:10:00.000Z',
    nodeIds: [importedNode.latest_node_id]
  });

  await fs.writeFile(filePath, '# Updated import\nBody changed\n', 'utf8');

  const preview = await previewKeepImportRule(createGenericKeepImportConfig(sourceDir, 'draft-import-source-101'));
  expect(preview.entries).toEqual([
    expect.objectContaining({
      detail: 'Deleted item will be imported again as a new node.',
      source_path: 'entry.md',
      status: 'new'
    })
  ]);

  await runKeepImportRule(createGenericKeepImportConfig(sourceDir, 'draft-import-source-101'));

  const nodeRows = connection.sqlite
    .prepare(`SELECT id, deleted_at FROM nodes WHERE title = 'entry' ORDER BY created_at ASC`)
    .all() as Array<{ deleted_at: string | null; id: string }>;
  const keepItem = connection.sqlite
    .prepare(
      `SELECT last_status, last_node_id
       FROM keep_import_items
       WHERE rule_id = 'draft-import-source-101' AND source_path = 'entry.md'`
    )
    .get() as { last_node_id: string; last_status: string };

  expect(nodeRows).toHaveLength(2);
  expect(nodeRows[0]?.id).toBe(importedNode.latest_node_id);
  expect(nodeRows[0]?.deleted_at).toBe('2026-03-25T00:10:00.000Z');
  expect(nodeRows[1]?.id).not.toBe(importedNode.latest_node_id);
  expect(nodeRows[1]?.deleted_at).toBeNull();
  expect(keepItem).toEqual({
    last_node_id: nodeRows[1]?.id,
    last_status: 'imported'
  });
});

it('writes a dedicated readwise scan log with per-file decisions', async () => {
  const sourceDir = path.join(tempRoot, 'readwise-articles');
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, 'article.md'), '# Imported\nBody\n', 'utf8');
  saveReadwiseKeepImportSettingsWithScope(
    {
      fullDocumentDir: sourceDir,
      highlightDir: sourceDir,
      readwiseRoot: sourceDir
    },
    'all'
  );

  await runKeepImportRule({
    directoryPath: sourceDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });

  const logFile = path.join(mockedAppDataDir, 'logs', 'import', `readwise-${new Date().toISOString().slice(0, 10)}.log`);
  const lines = (await fs.readFile(logFile, 'utf8')).trim().split('\n');
  const completedEvent = JSON.parse(lines.at(-1) ?? '{}') as {
    event?: string;
    payload?: { discovered_count?: number; entries?: Array<{ action?: string; source_path?: string }> };
  };

  expect(lines.length).toBeGreaterThanOrEqual(2);
  expect(completedEvent.event).toBe('readwise_scan_completed');
  expect(completedEvent.payload?.discovered_count).toBe(1);
  expect(completedEvent.payload?.entries).toEqual([
    expect.objectContaining({
      action: 'import_attempted',
      source_path: 'article.md'
    })
  ]);
});

it('wires readwise keep import into existing highlight-derived child creation', async () => {
  const fixture = await seedReadwiseArticleFixture(tempRoot);
  saveReadwiseKeepImportSettings(fixture);

  await runKeepImportRule({
    directoryPath: fixture.fullDocumentDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });
  const { childRows, parentRow } = readImportedChildRows();
  const firstAnchorLink = parseAnchorLink(childRows[0]!.anchor_link!);
  const secondAnchorLink = parseAnchorLink(childRows[1]!.anchor_link!);

  expect(childRows).toHaveLength(2);
  expect(parentRow.content).toContain('---\nauthor: Someone\n---');
  expect(parentRow.content).toContain('This is the highlighted sentence.');
  expect(parentRow.content).toContain('Another matching excerpt.');
  expect(childRows[0]).toEqual({
    anchor_link: childRows[0]!.anchor_link,
    content: 'This is the highlighted sentence.',
    title: 'This is the highlighted sentence.'
  });
  expect(childRows[1]).toEqual({
    anchor_link: childRows[1]!.anchor_link,
    content: 'Another matching excerpt.',
    title: 'Another matching excerpt.'
  });
  expect(firstAnchorLink).toEqual(expect.objectContaining({
    id: firstAnchorLink.id,
    kind: 'highlight',
    locator: expect.objectContaining({ originalText: 'This is the highlighted sentence.' })
  }));
  expect(secondAnchorLink).toEqual(expect.objectContaining({
    id: secondAnchorLink.id,
    kind: 'highlight',
    locator: expect.objectContaining({ originalText: 'Another matching excerpt.' })
  }));
});

it('treats sidecar highlight changes as a separate refresh trigger when the body file is unchanged', async () => {
  const fixture = await seedReadwiseArticleFixture(tempRoot);
  saveReadwiseKeepImportSettings(fixture);

  await runKeepImportRule({
    directoryPath: fixture.fullDocumentDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });

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

  const preview = await previewKeepImportRule({
    directoryPath: fixture.fullDocumentDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });

  expect(preview.entries).toEqual([
    expect.objectContaining({
      detail: 'Highlight file changed and will refresh highlight updates.',
      source_path: 'Sample Article.md',
      status: 'updated'
    })
  ]);
});
