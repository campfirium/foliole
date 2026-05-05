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

it('blocks keep auto recreation after the imported node is deleted', async () => {
  const sourceDir = path.join(tempRoot, 'sources');
  await fs.mkdir(sourceDir, { recursive: true });
  const filePath = path.join(sourceDir, 'entry.md');

  await fs.writeFile(filePath, '# First import\nBody\n', 'utf8');
  await runKeepImportRule({
    directoryPath: sourceDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-101'
  });

  const connection = openDatabaseConnection();
  const importedNode = connection.sqlite
    .prepare(`SELECT latest_node_id FROM import_sources WHERE source_name = 'entry.md'`)
    .get() as { latest_node_id: string };

  softDeleteNodes({
    deletedAt: '2026-03-25T00:10:00.000Z',
    nodeIds: [importedNode.latest_node_id]
  });

  await fs.writeFile(filePath, '# Updated import\nBody changed\n', 'utf8');

  const preview = await previewKeepImportRule({
    directoryPath: sourceDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-101'
  });
  expect(preview.entries).toEqual([
    expect.objectContaining({
      source_path: 'entry.md',
      status: 'blocked_deleted'
    })
  ]);

  await runKeepImportRule({
    directoryPath: sourceDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-101'
  });

  const nodeCount = connection.sqlite.prepare(`SELECT COUNT(*) AS count FROM nodes WHERE title = 'entry.md'`).get() as { count: number };
  const keepItem = connection.sqlite
    .prepare(
      `SELECT last_status, last_node_id
       FROM keep_import_items
       WHERE rule_id = 'draft-import-source-101' AND source_path = 'entry.md'`
    )
    .get() as { last_node_id: string; last_status: string };

  expect(nodeCount.count).toBe(1);
  expect(keepItem).toEqual({
    last_node_id: importedNode.latest_node_id,
    last_status: 'blocked_deleted'
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

  expect(childRows).toHaveLength(2);
  expect(parentRow.content).toContain('---\nauthor: Someone\n---');
  expect(parentRow.content).toContain('<highlight id="1">This is the highlighted sentence.</highlight id="1">');
  expect(parentRow.content).toContain('<highlight id="2">Another matching excerpt.</highlight id="2">');
  expect(childRows[0]).toEqual({
    anchor_link: JSON.stringify({ id: '1', kind: 'highlight' }),
    content: 'This is the highlighted sentence.',
    title: 'This is the highlighted sentence.'
  });
  expect(childRows[1]).toEqual({
    anchor_link: JSON.stringify({ id: '2', kind: 'highlight' }),
    content: 'Another matching excerpt.',
    title: 'Another matching excerpt.'
  });
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

it('notifies the renderer after keep imports write a new record', async () => {
  await fs.writeFile(path.join(tempRoot, 'entry.md'), '# Imported\nBody\n', 'utf8');

  await runKeepImportRule({
    directoryPath: tempRoot,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-301'
  });

  expect(notifyManagedInboxUpdated).toHaveBeenCalledTimes(1);
  expect(notifyManagedInboxUpdated).toHaveBeenCalledWith(expect.stringMatching(/^import-/));
});
