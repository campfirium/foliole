// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-keep-import-generic-tests';
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

import { previewKeepImportRule, runKeepImportRule } from './keepImportService.js';
import { createGenericKeepImportConfig, mapChildRowsWithAnchorLink, parseAnchorLink } from './keepImportService.test-support.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-keep-import-generic-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
  notifyManagedInboxUpdated.mockReset();
});

it('notifies the renderer after keep imports write a new record', async () => {
  await fs.writeFile(path.join(tempRoot, 'entry.md'), '# Imported\nBody\n', 'utf8');

  await runKeepImportRule(createGenericKeepImportConfig(tempRoot, 'draft-import-source-301'));

  expect(notifyManagedInboxUpdated).toHaveBeenCalledTimes(1);
  expect(notifyManagedInboxUpdated).toHaveBeenCalledWith(expect.stringMatching(/^import-/));
});

it('adopts inline markdown highlights for generic merged keep imports', async () => {
  const sourceDir = path.join(tempRoot, 'merged-source');
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, 'entry.md'), 'Before ==important== after', 'utf8');

  const preview = await previewKeepImportRule(createGenericKeepImportConfig(sourceDir, 'draft-import-source-101', 'adopt'));

  expect(preview.entries).toEqual([
    expect.objectContaining({
      content_preview: 'Before important after',
      detected_highlight_count: 1,
      highlight_samples: [
        expect.objectContaining({
          highlightText: 'important',
          matched: true,
          sourceName: 'entry.md'
        })
      ],
      source_path: 'entry.md',
      status: 'new'
    })
  ]);

  await runKeepImportRule(createGenericKeepImportConfig(sourceDir, 'draft-import-source-101', 'adopt'));

  const row = openDatabaseConnection().sqlite
    .prepare(
      `SELECT id, content
       FROM nodes
       WHERE title = 'entry'
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get() as { content: string; id: string };
  const childRows = openDatabaseConnection().sqlite
    .prepare('SELECT title, content, anchor_link FROM nodes WHERE parent_id = ? ORDER BY created_at ASC')
    .all(row.id) as Array<{ anchor_link: string | null; content: string; title: string }>;
  const anchorLink = parseAnchorLink(childRows[0]!.anchor_link!);

  expect(row.content).toBe('Before important after');
  expect(mapChildRowsWithAnchorLink(childRows as Array<{ anchor_link: string | null; content: string; title: string }>)).toEqual([
    {
      anchorLink: expect.objectContaining({
        id: anchorLink.id,
        kind: 'highlight',
        locator: expect.objectContaining({ originalText: 'important' })
      }),
      content: 'important',
      title: 'important'
    }
  ]);
});

it('fails fast for unsupported generic split keep imports', async () => {
  const sourceDir = path.join(tempRoot, 'split-source');
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, 'entry.md'), '# Imported\nBody\n', 'utf8');

  await expect(
    previewKeepImportRule({
      directoryPath: sourceDir,
      highlightMode: 'split',
      highlightPolicy: 'reference_only',
      ruleId: 'draft-import-source-102',
      sourceType: 'generic'
    })
  ).rejects.toThrow('Generic split highlights are not available yet.');

  await expect(
    runKeepImportRule({
      directoryPath: sourceDir,
      highlightMode: 'split',
      highlightPolicy: 'reference_only',
      ruleId: 'draft-import-source-102',
      sourceType: 'generic'
    })
  ).rejects.toThrow('Generic split highlights are not available yet.');
});
