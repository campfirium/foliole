// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const runKeepImportRule = vi.hoisted(() => vi.fn());
const readwiseSettings = vi.hoisted(() => ({
  readwiseReaderConfig: {
    enabled: true,
    highlightsHeading: '## Highlights',
    highlightSeparator: '\n\n',
    importScope: 'highlights_only',
    newHighlightsHeading: '## New highlights added',
    noteKeyword: 'Note:',
    tagKeyword: 'Tags:',
    withHighlightsDestination: 'inbox',
    withoutHighlightsDestination: 'off'
  },
  readwiseRootPath: '/readwise',
  readwiseSources: [
    {
      actionMode: 'keep',
      archivePath: '',
      highlightMode: 'split',
      highlightPath: '/readwise/Articles',
      id: 'draft-import-source-1',
      keepPreview: null,
      keepState: 'enabled',
      kind: 'articles',
      primaryPath: '/readwise/Full Document Contents/Articles'
    }
  ]
}));

function createMissingDirectoryError(code: 'ENOENT' | 'ENOTDIR') {
  return Object.assign(new Error('missing Readwise source directory'), { code });
}

vi.mock('./keepImportService.js', () => ({
  runKeepImportRule
}));

vi.mock('./importManagerSettings.js', () => ({
  loadImportManagerSettings: vi.fn(() => readwiseSettings),
  saveImportManagerSettings: vi.fn((settings) => settings)
}));

import { runReadwiseReaderImport } from './readwiseReaderImportRun.js';

function createSettings() {
  return structuredClone(readwiseSettings);
}

beforeEach(() => {
  runKeepImportRule.mockReset();
});

it('coalesces overlapping Readwise sync requests into one import pass', async () => {
  let releaseImport!: () => void;
  runKeepImportRule.mockReturnValue(
    new Promise((resolve) => {
      releaseImport = () =>
        resolve([
          {
            action: 'import_attempted',
            importStatus: 'imported',
            previewStatus: 'new'
          }
        ]);
    })
  );

  const first = runReadwiseReaderImport({ settings: createSettings() });
  const second = runReadwiseReaderImport({ settings: createSettings() });

  expect(runKeepImportRule).toHaveBeenCalledTimes(1);
  releaseImport();
  await expect(Promise.all([first, second])).resolves.toEqual([
    expect.objectContaining({ imported_count: 1 }),
    expect.objectContaining({ imported_count: 1 })
  ]);
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
  runKeepImportRule
    .mockResolvedValueOnce([
      {
        action: 'import_attempted',
        importStatus: 'imported',
        previewStatus: 'new'
      }
    ])
    .mockRejectedValueOnce(createMissingDirectoryError('ENOENT'))
    .mockRejectedValueOnce(createMissingDirectoryError('ENOTDIR'));

  await expect(runReadwiseReaderImport({ settings })).resolves.toMatchObject({
    failed_count: 0,
    imported_count: 1,
    source_count: 3,
    status: 'completed'
  });
});
