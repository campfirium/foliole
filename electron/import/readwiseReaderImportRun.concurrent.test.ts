// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import { IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL } from '../ipc/contracts.js';

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

function createProgressWindow(destroyed = false) {
  return {
    isDestroyed: vi.fn(() => destroyed),
    webContents: { send: vi.fn() }
  };
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
  const window = createProgressWindow();
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

  const first = runReadwiseReaderImport({ settings: createSettings(), window });
  const second = runReadwiseReaderImport({ settings: createSettings(), window });

  expect(runKeepImportRule).toHaveBeenCalledTimes(1);
  releaseImport();
  await expect(Promise.all([first, second])).resolves.toEqual([
    expect.objectContaining({ imported_count: 1 }),
    expect.objectContaining({ imported_count: 1 })
  ]);
  expect(window.webContents.send).toHaveBeenCalledTimes(3);
  expect(window.webContents.send).toHaveBeenNthCalledWith(
    1,
    IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL,
    { processedCount: 0, status: 'running', totalCount: 1 }
  );
  expect(window.webContents.send).toHaveBeenNthCalledWith(
    3,
    IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL,
    { processedCount: 1, status: 'completed', totalCount: 1 }
  );
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

it('records real Readwise source failures with source path details', async () => {
  const settings = createSettings();
  settings.readwiseSources.push({
    ...settings.readwiseSources[0]!,
    highlightPath: '/readwise/Tweets',
    id: 'draft-import-source-3',
    kind: 'tweets',
    primaryPath: '/readwise/Full Document Contents/Tweets'
  });
  runKeepImportRule
    .mockResolvedValueOnce([
      {
        action: 'import_attempted',
        importStatus: 'imported',
        previewStatus: 'new'
      }
    ])
    .mockRejectedValueOnce(new Error('permission denied'));

  await expect(runReadwiseReaderImport({ settings })).resolves.toMatchObject({
    failed_count: 1,
    failed_sources: [
      {
        reason: 'permission denied',
        source_kind: 'tweets',
        source_path: '/readwise/Full Document Contents/Tweets'
      }
    ],
    imported_count: 1,
    source_count: 2,
    status: 'failed'
  });
});

it('does not publish Readwise progress after the target window is destroyed', async () => {
  const window = createProgressWindow(true);
  runKeepImportRule.mockResolvedValue([
    {
      action: 'import_attempted',
      importStatus: 'imported',
      previewStatus: 'new'
    }
  ]);

  await runReadwiseReaderImport({ settings: createSettings(), window });

  expect(window.webContents.send).not.toHaveBeenCalled();
});
