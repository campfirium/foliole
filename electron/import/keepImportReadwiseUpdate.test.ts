// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-keep-import-readwise-update-tests';
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

import { closeDatabaseConnection } from '../database/connection.js';
import { openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import {
  readImportedChildRows,
  readImportedReadwiseSourceRow,
  saveReadwiseKeepImportSettings,
  seedReadwiseArticleFixture
} from './keepImportReadwiseTestSupport.js';
import { runKeepImportRule } from './keepImportService.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-keep-import-readwise-update-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
  notifyManagedInboxUpdated.mockReset();
});

async function runReadwiseKeepImport(fullDocumentDir: string) {
  await runKeepImportRule({
    directoryPath: fullDocumentDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });
}

it('adds only newly anchored readwise highlights during keep import updates', async () => {
  const fixture = await seedReadwiseArticleFixture(tempRoot);
  saveReadwiseKeepImportSettings(fixture);
  await runReadwiseKeepImport(fixture.fullDocumentDir);
  const initialState = readImportedChildRows();

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
      'Missing new quote.'
    ].join('\n'),
    'utf8'
  );
  await runReadwiseKeepImport(fixture.fullDocumentDir);

  const { childRows, parentRow } = readImportedChildRows();
  const keepItem = openDatabaseConnection().sqlite
    .prepare(
      `SELECT has_source_update
       FROM keep_import_items
       WHERE rule_id = 'draft-import-source-1' AND source_path = 'Sample Article.md'`
    )
    .get() as { has_source_update: number };

  expect(childRows).toEqual(initialState.childRows);
  expect(keepItem.has_source_update).toBe(1);
  expect(parentRow.content).not.toContain('Completely different upstream body.');
  expect(parentRow.content).toBe(initialState.parentRow.content);
  expect(parentRow.content).not.toContain('Missing new quote.');
});

it('appends new readwise highlights without flagging source updates when only the highlight file changes', async () => {
  const fixture = await seedReadwiseArticleFixture(tempRoot);
  saveReadwiseKeepImportSettings(fixture);
  await runReadwiseKeepImport(fixture.fullDocumentDir);
  const initialState = readImportedChildRows();

  const importCountBefore = openDatabaseConnection().sqlite
    .prepare(`SELECT COUNT(*) AS count FROM import_runs WHERE source_name = 'Sample Article.md'`)
    .get() as { count: number };

  await fs.writeFile(
    path.join(fixture.highlightDir, 'Sample Article.md'),
    [
      '# Sample Article',
      '',
      '## Highlights',
      '## New highlights added May 27, 2026 at 11:20 AM',
      '- After the quote. ([View Highlight](https://read.readwise.io/read/01new))',
      '',
      '## Old highlights',
      'This is the highlighted sentence. [...] (https://example.com)',
      '',
      'Another matching excerpt.',
      'Note: Keep import note',
      'Tags: [[tag-a]] [[tag-b]]',
      '',
      '## Document notes',
      'This is not a highlight.'
    ].join('\n'),
    'utf8'
  );
  const fullDocumentPath = path.join(fixture.fullDocumentDir, 'Sample Article.md');
  const fullDocumentStats = await fs.stat(fullDocumentPath);
  await fs.utimes(fullDocumentPath, fullDocumentStats.atime, new Date(fullDocumentStats.mtimeMs + 1000));
  const runEntries = await runKeepImportRule({
    directoryPath: fixture.fullDocumentDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });

  const { childRows, parentRow } = readImportedChildRows();
  const keepItem = openDatabaseConnection().sqlite
    .prepare(
      `SELECT has_source_update
       FROM keep_import_items
       WHERE rule_id = 'draft-import-source-1' AND source_path = 'Sample Article.md'`
    )
    .get() as { has_source_update: number };
  const importCountAfter = openDatabaseConnection().sqlite
    .prepare(`SELECT COUNT(*) AS count FROM import_runs WHERE source_name = 'Sample Article.md'`)
    .get() as { count: number };

  const appendedHighlight = childRows.find((row) => row.content === 'After the quote.');
  expect(childRows).toHaveLength(initialState.childRows.length + 1);
  expect(appendedHighlight?.anchor_link).toEqual(expect.stringContaining('imported-highlight'));
  expect(childRows.some((row) => row.content === 'This is not a highlight.')).toBe(false);
  expect(runEntries).toContainEqual(expect.objectContaining({
    importStatus: 'imported',
    previewStatus: 'updated',
    sourcePath: 'Sample Article.md'
  }));
  expect(importCountAfter.count).toBe(importCountBefore.count + 1);
  expect(keepItem.has_source_update).toBe(0);
  expect(parentRow.content).toBe(initialState.parentRow.content);
});

it('keeps the same imported source after the readwise root folder moves', async () => {
  const fixture = await seedReadwiseArticleFixture(tempRoot);
  saveReadwiseKeepImportSettings(fixture);
  await runReadwiseKeepImport(fixture.fullDocumentDir);

  const firstSource = readImportedReadwiseSourceRow();
  const movedRoot = path.join(tempRoot, 'readwise-moved');
  await fs.rename(path.join(tempRoot, 'readwise'), movedRoot);

  const movedFixture = {
    fullDocumentDir: path.join(movedRoot, 'Full Document Contents', 'Articles'),
    highlightDir: path.join(movedRoot, 'Articles'),
    readwiseRoot: movedRoot
  };
  saveReadwiseKeepImportSettings(movedFixture);

  await fs.writeFile(
    path.join(movedFixture.highlightDir, 'Sample Article.md'),
    [
      '# Sample Article',
      '',
      '## Highlights',
      'This is the highlighted sentence. [...] (https://example.com)',
      '',
      'Another matching excerpt. Tags: [[tag-a]] [[tag-b]]',
      '',
      'After moving the folder.'
    ].join('\n'),
    'utf8'
  );

  await runReadwiseKeepImport(movedFixture.fullDocumentDir);

  const secondSource = readImportedReadwiseSourceRow();
  const sourceCount = openDatabaseConnection().sqlite
    .prepare(`SELECT COUNT(*) AS count FROM import_sources WHERE source_name = 'Sample Article.md'`)
    .get() as { count: number };

  expect(secondSource.source_fingerprint).toBe(firstSource.source_fingerprint);
  expect(secondSource.latest_node_id).toBe(firstSource.latest_node_id);
  expect(secondSource.source_locator).toBe(path.join(movedFixture.fullDocumentDir, 'Sample Article.md'));
  expect(sourceCount.count).toBe(1);
});
