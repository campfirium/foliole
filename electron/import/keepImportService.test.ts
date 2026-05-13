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

it('blocks automatic keep-import recreation after the previous node was deleted', async () => {
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
      detail: 'This source was deleted in Foliole and will stay blocked until you import it again manually.',
      source_path: 'entry.md',
      status: 'blocked_deleted'
    })
  ]);

  await runKeepImportRule(createGenericKeepImportConfig(sourceDir, 'draft-import-source-101'));

  const nodeRows = connection.sqlite
    .prepare(`SELECT id, deleted_at FROM nodes WHERE title = 'entry' ORDER BY created_at ASC`)
    .all() as Array<{ deleted_at: string | null; id: string }>;
  const keepItem = connection.sqlite
    .prepare(
      `SELECT has_source_update, last_status, last_node_id, local_node_state, source_state
       FROM keep_import_items
       WHERE rule_id = 'draft-import-source-101' AND source_path = 'entry.md'`
    )
    .get() as { has_source_update: number; last_node_id: string; last_status: string; local_node_state: string; source_state: string };

  expect(nodeRows).toHaveLength(1);
  expect(nodeRows[0]?.id).toBe(importedNode.latest_node_id);
  expect(nodeRows[0]?.deleted_at).toBe('2026-03-25T00:10:00.000Z');
  expect(keepItem).toEqual({
    has_source_update: 1,
    last_node_id: importedNode.latest_node_id,
    last_status: 'blocked_deleted',
    local_node_state: 'locally_deleted',
    source_state: 'present'
  });
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
    content: 'Another matching excerpt.\n※ Keep import note',
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
