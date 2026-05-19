// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const requestKeepImportRuleRun = vi.hoisted(() => vi.fn());

vi.mock('./keepImportService.js', () => ({
  requestKeepImportRuleRun,
  runKeepImportRule: vi.fn()
}));

vi.mock('./keepImportMonitorRuntime.js', () => ({
  isKeepImportMonitorSnapshotFresh: vi.fn(() => false)
}));

vi.mock('./importManagerSettings.js', () => ({
  loadImportManagerSettings: vi.fn(),
  saveImportManagerSettings: vi.fn((settings) => settings)
}));

import { runReadwiseReaderImport } from './readwiseReaderImportRun.js';

function createMissingDirectoryError(code: 'ENOENT' | 'ENOTDIR') {
  return Object.assign(new Error('missing Readwise source directory'), { code });
}

function createSettings() {
  return {
    readwiseReaderConfig: {
      enabled: true,
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      withHighlightsDestination: 'inbox',
      withoutHighlightsDestination: 'off'
    },
    readwiseRootPath: '/readwise',
    readwiseSources: [
      {
        highlightPath: '/readwise/Articles',
        id: 'draft-import-source-1',
        keepState: 'enabled',
        kind: 'articles',
        primaryPath: '/readwise/Full Document Contents/Articles'
      }
    ]
  };
}

beforeEach(() => {
  requestKeepImportRuleRun.mockReset();
});

it('skips missing optional Readwise source directories without failing the sync', async () => {
  const settings = createSettings();
  settings.readwiseSources.push(
    {
      ...settings.readwiseSources[0]!,
      highlightPath: '/readwise/Tweets',
      id: 'draft-import-source-3',
      kind: 'tweets',
      primaryPath: '/readwise/Full Document Contents/Tweets'
    },
    {
      ...settings.readwiseSources[0]!,
      highlightPath: '/readwise/Podcasts',
      id: 'draft-import-source-4',
      kind: 'podcasts',
      primaryPath: '/readwise/Full Document Contents/Podcasts'
    }
  );
  requestKeepImportRuleRun
    .mockResolvedValueOnce([{ action: 'import_attempted', importStatus: 'imported', previewStatus: 'new' }])
    .mockRejectedValueOnce(createMissingDirectoryError('ENOENT'))
    .mockRejectedValueOnce(createMissingDirectoryError('ENOTDIR'));

  await expect(runReadwiseReaderImport({ settings })).resolves.toMatchObject({
    failed_count: 0,
    imported_count: 1,
    source_count: 3,
    status: 'completed'
  });
});

it('records real Readwise source failures with source path details', async () => {
  const settings = createSettings();
  settings.readwiseSources.push({
    ...settings.readwiseSources[0]!,
    highlightPath: '/readwise/Tweets',
    id: 'draft-import-source-3',
    kind: 'tweets',
    primaryPath: '/readwise/Full Document Contents/Tweets'
  });
  requestKeepImportRuleRun
    .mockResolvedValueOnce([{ action: 'import_attempted', importStatus: 'imported', previewStatus: 'new' }])
    .mockRejectedValueOnce(new Error('permission denied'));

  await expect(runReadwiseReaderImport({ settings })).resolves.toMatchObject({
    failed_count: 1,
    failed_sources: [{ reason: 'permission denied', source_kind: 'tweets' }],
    imported_count: 1,
    source_count: 2,
    status: 'failed'
  });
});
