// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-lightweight-tests';
const mockFetchRemoteImageResource = vi.hoisted(() => vi.fn(async () => ({
  error: { message: 'network disabled', status: 'error' },
  status: 'error'
})));
const notifyManagedInboxUpdated = vi.hoisted(() => vi.fn());

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

vi.mock('../attachments/remoteImagePipeline.js', () => ({
  fetchRemoteImageResource: mockFetchRemoteImageResource
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { closeExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';
import { initializeDatabase } from '../database/migrate.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import type { KeepImportProgressEvent } from './keepImportProgress.js';
import { runKeepImportRule } from './keepImportService.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-lightweight-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function seedFixture() {
  const fullDocumentDir = path.join(tempRoot, 'readwise', 'Full Document Contents', 'Articles');
  const highlightDir = path.join(tempRoot, 'readwise', 'Articles');
  await fs.mkdir(fullDocumentDir, { recursive: true });
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.writeFile(
    path.join(fullDocumentDir, 'Highlighted.md'),
    [
      '# Same Title',
      '',
      '## Metadata',
      '- Author: Someone',
      '',
      '## Full Document',
      'Body with ![Remote](https://example.test/image.png).'
    ].join('\n'),
    'utf8'
  );
  await fs.writeFile(path.join(highlightDir, 'Highlighted.md'), '# Same Title\n\n## Highlights\nHighlighted body.\n', 'utf8');
  return { fullDocumentDir, highlightDir, readwiseRoot: path.join(tempRoot, 'readwise') };
}

async function runReadwiseArticles(fullDocumentDir: string, onProgress?: (event: KeepImportProgressEvent) => void) {
  await runKeepImportRule({
    directoryPath: fullDocumentDir,
    highlightPolicy: 'reference_only',
    ...(onProgress ? { onProgress } : {}),
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });
}

function readRows<T>(sql: string) {
  return openDatabaseConnection().sqlite.prepare(sql).all() as T[];
}

it('keeps Readwise inbox checks on the lightweight path without remote image downloads', async () => {
  const fixture = await seedFixture();
  saveImportManagerSettings({
    readwiseReaderConfig: {
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      validatedAt: '2026-05-11T00:00:00.000Z',
      withHighlightsDestination: 'inbox',
      withoutHighlightsDestination: 'off'
    },
    readwiseRootPath: fixture.readwiseRoot,
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: fixture.highlightDir,
        id: 'draft-import-source-1',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'articles',
        primaryPath: fixture.fullDocumentDir
      }
    ]
  });

  await runReadwiseArticles(fixture.fullDocumentDir);
  expect(mockFetchRemoteImageResource).not.toHaveBeenCalled();

  mockFetchRemoteImageResource.mockClear();
  await runReadwiseArticles(fixture.fullDocumentDir);

  expect(mockFetchRemoteImageResource).not.toHaveBeenCalled();
  expect(notifyManagedInboxUpdated).not.toHaveBeenCalled();
  expect(readRows("SELECT source_path FROM keep_import_items WHERE source_path = 'Highlighted.md'")).toEqual([
    { source_path: 'Highlighted.md' }
  ]);
});

it('skips Readwise sources without a sidecar on the off path without reading source content', async () => {
  const fixture = await seedFixture();
  await fs.rm(path.join(fixture.fullDocumentDir, 'Highlighted.md'));
  await fs.rm(path.join(fixture.highlightDir, 'Highlighted.md'));
  await fs.writeFile(
    path.join(fixture.fullDocumentDir, 'No Highlight.md'),
    [
      '# No Highlight',
      '',
      '## Metadata',
      '- Author: Someone',
      '',
      '## Full Document',
      'Body that should not be read.'
    ].join('\n'),
    'utf8'
  );
  saveImportManagerSettings({
    readwiseReaderConfig: {
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      validatedAt: '2026-05-11T00:00:00.000Z',
      withHighlightsDestination: 'inbox',
      withoutHighlightsDestination: 'off'
    },
    readwiseRootPath: fixture.readwiseRoot,
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: fixture.highlightDir,
        id: 'draft-import-source-1',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'articles',
        primaryPath: fixture.fullDocumentDir
      }
    ]
  });
  const readFileSpy = vi.spyOn(fs, 'readFile');
  const progressEvents: KeepImportProgressEvent[] = [];

  await runReadwiseArticles(fixture.fullDocumentDir, (event) => progressEvents.push(event));

  expect(
    readFileSpy.mock.calls.some(([filePath]) => String(filePath).endsWith('No Highlight.md'))
  ).toBe(false);
  expect(readRows("SELECT source_name FROM import_runs WHERE source_name = 'No Highlight'")).toEqual([]);
  expect(readRows("SELECT source_name FROM import_sources WHERE source_name = 'No Highlight'")).toEqual([]);
  expect(readRows("SELECT object_id FROM sync_object_state WHERE object_type = 'import_source'")).toEqual([]);
  expect(readRows("SELECT source_path FROM keep_import_items WHERE source_path = 'No Highlight.md'")).toEqual([
    { source_path: 'No Highlight.md' }
  ]);
  expect(progressEvents.at(-1)).toEqual(expect.objectContaining({
    currentSourcePath: 'No Highlight.md',
    phase: 'source_completed',
    sourceProcessedCount: 1,
    sourceTotalCount: 1
  }));
});
