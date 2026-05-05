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
import { initializeDatabase } from '../database/migrate.js';

import {
  readImportedChildRows,
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

  expect(childRows).toHaveLength(2);
  expect(parentRow.content).not.toContain('Completely different upstream body.');
  expect(parentRow.content).toContain('<highlight id="1">This is the highlighted sentence.</highlight id="1">');
  expect(parentRow.content).toContain('<highlight id="2">Another matching excerpt.</highlight id="2">');
  expect(parentRow.content).toContain('## Unmatched Sidecar Highlights');
  expect(parentRow.content).toContain('- Highlight 1: Missing new quote.');
});
