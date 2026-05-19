// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-inbox-metadata-refresh-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('./managedInboxEvents.js', () => ({
  notifyManagedInboxUpdated: vi.fn()
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { closeExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';
import { initializeDatabase } from '../database/migrate.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { runReadwiseReaderImport } from './readwiseReaderImportRun.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-inbox-metadata-refresh-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function seedReadwiseSource(fullDocumentMarkdown: string) {
  const fullDocumentDir = path.join(tempRoot, 'readwise', 'Full Document Contents', 'Articles');
  const highlightDir = path.join(tempRoot, 'readwise', 'Articles');
  await fs.mkdir(fullDocumentDir, { recursive: true });
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.writeFile(path.join(fullDocumentDir, 'Highlighted.md'), fullDocumentMarkdown, 'utf8');
  await fs.writeFile(path.join(highlightDir, 'Highlighted.md'), '# Same Title\n\n## Highlights\nHighlighted body.\n', 'utf8');
  saveImportManagerSettings({
    readwiseReaderConfig: {
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      validatedAt: '2026-05-11T00:00:00.000Z',
      withHighlightsDestination: 'inbox',
      withoutHighlightsDestination: 'off'
    },
    readwiseRootPath: path.join(tempRoot, 'readwise'),
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: highlightDir,
        id: 'draft-import-source-1',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'articles',
        primaryPath: fullDocumentDir
      }
    ]
  });
  return { fullDocumentDir };
}

function readImportedNodeContent() {
  return openDatabaseConnection().sqlite
    .prepare("SELECT content FROM nodes WHERE title = 'Highlighted'")
    .get() as { content: string } | undefined;
}

it('refreshes Readwise Inbox metadata when stored source signatures are already current', async () => {
  const firstContent = ['## Full Document', 'Highlighted body.'].join('\n');
  const fixture = await seedReadwiseSource(firstContent);
  await runReadwiseReaderImport();

  const nextContent = [
    '## Metadata',
    '- Author: [[waudero]]',
    '- Full Title: Lists Twitter List: January 17',
    '- Category: #articles',
    '- Summary: Tweets from 卡尔的AI沃茨, and 宝玉.',
    '- URL: https://twitter.com/i/lists/1869949878283186480?ts=1737155739.175127',
    '',
    '## Full Document',
    'Highlighted body.'
  ].join('\n');
  const sourcePath = path.join(fixture.fullDocumentDir, 'Highlighted.md');
  await fs.writeFile(sourcePath, nextContent, 'utf8');
  const stats = await fs.stat(sourcePath);
  openDatabaseConnection().sqlite
    .prepare('UPDATE keep_import_items SET source_mtime_ms = ?, source_size_bytes = ? WHERE source_path = ?')
    .run(stats.mtimeMs, stats.size, 'Highlighted.md');

  await runReadwiseReaderImport();

  expect(readImportedNodeContent()).toEqual({
    content: [
      '---',
      'author: [[waudero]]',
      'full_title: Lists Twitter List: January 17',
      'category: #articles',
      'summary: Tweets from 卡尔的AI沃茨, and 宝玉.',
      'url: https://twitter.com/i/lists/1869949878283186480?ts=1737155739.175127',
      '---',
      'Highlighted body.'
    ].join('\n')
  });
});
