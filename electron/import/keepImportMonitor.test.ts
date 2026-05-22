// @vitest-environment node

import { expect, it, vi } from 'vitest';

import {
  createDefaultImportManagerSettings,
  type ImportManagerSettings
} from '../../lib/core/import/importManagerSettings.js';

import { createKeepImportMonitor } from './keepImportMonitor.js';
import { KeepImportWatchMissingDirectoryError } from './keepImportWatch.js';

function triggerWatchListener(listener: (() => void) | null) {
  if (!listener) {
    throw new Error('watch listener was not registered');
  }
  listener();
}

function createReadwiseSettings(primaryPath: string, highlightPath: string): ImportManagerSettings {
  return {
    ...createDefaultImportManagerSettings(),
    readwiseReaderConfig: {
      ...createDefaultImportManagerSettings().readwiseReaderConfig,
      validatedAt: '2026-03-26T01:00:00.000Z'
    },
    readwiseRootPath: '/tmp/readwise',
    readwiseSources: [
      {
        actionMode: 'keep',
        archivePath: '',
        highlightMode: 'split',
        highlightPath,
        id: 'draft-import-source-1',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'tweets',
        primaryPath
      }
    ],
    updatedAt: '2026-03-26T01:00:00.000Z'
  };
}

it('watches both readwise full document and highlight folders', async () => {
  vi.useFakeTimers();
  const watch = vi.fn(() => ({ close: vi.fn() }));
  const monitor = createKeepImportMonitor({
    debounceMs: 0,
    loadSettings: () => ({
      ...createDefaultImportManagerSettings(),
      readwiseReaderConfig: {
        ...createDefaultImportManagerSettings().readwiseReaderConfig,
        highlightSeparator: '\\n\\n',
        highlightsHeading: '## Highlights',
        importScope: 'highlights_only',
        newHighlightsHeading: '## New highlights added',
        noteKeyword: 'Note:',
        tagKeyword: 'Tags:',
        validatedAt: '2026-03-26T01:00:00.000Z'
      },
      readwiseRootPath: '/tmp/readwise',
      readwiseSources: [
        {
          actionMode: 'keep',
          archivePath: '',
          highlightMode: 'split',
          highlightPath: '/tmp/readwise/Articles',
          id: 'draft-import-source-1',
          keepPreview: null,
          keepState: 'enabled',
          kind: 'articles',
          primaryPath: '/tmp/readwise/Full Document Contents/Articles'
        }
      ],
      updatedAt: '2026-03-26T01:00:00.000Z'
    }),
    logError: vi.fn(),
    runCycle: vi.fn(async () => undefined),
    watch
  });

  await monitor.start();
  await vi.runAllTimersAsync();

  expect(watch).toHaveBeenCalledTimes(2);
  expect(watch).toHaveBeenNthCalledWith(1, '/tmp/readwise/Full Document Contents/Articles', expect.any(Function));
  expect(watch).toHaveBeenNthCalledWith(2, '/tmp/readwise/Articles', expect.any(Function));

  monitor.stop();
  vi.useRealTimers();
});

it('reports a fresh snapshot only after a clean monitor cycle', async () => {
  vi.useFakeTimers();
  let listener: (() => void) | null = null;
  const runCycle = vi.fn(async () => undefined);
  const monitor = createKeepImportMonitor({
    debounceMs: 0,
    loadSettings: () => ({
      ...createDefaultImportManagerSettings(),
      readwiseReaderConfig: {
        ...createDefaultImportManagerSettings().readwiseReaderConfig,
        validatedAt: '2026-03-26T01:00:00.000Z'
      },
      readwiseRootPath: '/tmp/readwise',
      readwiseSources: [
        {
          actionMode: 'keep',
          archivePath: '',
          highlightMode: 'split',
          highlightPath: '/tmp/readwise/Articles',
          id: 'draft-import-source-1',
          keepPreview: null,
          keepState: 'enabled',
          kind: 'articles',
          primaryPath: '/tmp/readwise/Full Document Contents/Articles'
        }
      ],
      updatedAt: '2026-03-26T01:00:00.000Z'
    }),
    logError: vi.fn(),
    runCycle,
    watch: vi.fn((_path, nextListener) => {
      listener = nextListener;
      return { close: vi.fn() };
    })
  });

  expect(monitor.isSnapshotFresh('draft-import-source-1')).toBe(false);
  await monitor.start();
  await vi.runAllTimersAsync();
  expect(monitor.isSnapshotFresh('draft-import-source-1')).toBe(true);

  triggerWatchListener(listener);
  expect(monitor.isSnapshotFresh('draft-import-source-1')).toBe(false);
  await vi.runAllTimersAsync();
  expect(monitor.isSnapshotFresh('draft-import-source-1')).toBe(true);

  monitor.stop();
  vi.useRealTimers();
});

it.each([
  {
    expectedCycleCount: 1,
    expectedMissingPaths: ['/tmp/readwise/Full Document Contents/Tweets'],
    label: 'primary path missing',
    missingPaths: new Set(['/tmp/readwise/Full Document Contents/Tweets'])
  },
  {
    expectedCycleCount: 1,
    expectedMissingPaths: ['/tmp/readwise/Tweets'],
    label: 'highlight path missing',
    missingPaths: new Set(['/tmp/readwise/Tweets'])
  },
  {
    expectedCycleCount: 0,
    expectedMissingPaths: ['/tmp/readwise/Full Document Contents/Tweets', '/tmp/readwise/Tweets'],
    label: 'both paths missing',
    missingPaths: new Set(['/tmp/readwise/Full Document Contents/Tweets', '/tmp/readwise/Tweets'])
  },
  {
    expectedCycleCount: 1,
    expectedMissingPaths: [],
    label: 'both paths present',
    missingPaths: new Set<string>()
  }
])('handles keep-import monitor startup when $label', async ({ expectedCycleCount, expectedMissingPaths, missingPaths }) => {
  vi.useFakeTimers();
  const logMissingDirectory = vi.fn();
  const runCycle = vi.fn(async () => undefined);
  const watch = vi.fn((watchPath: string) => {
    if (missingPaths.has(watchPath)) {
      throw new KeepImportWatchMissingDirectoryError(watchPath);
    }
    return { close: vi.fn() };
  });
  const monitor = createKeepImportMonitor({
    debounceMs: 0,
    loadSettings: () => createReadwiseSettings('/tmp/readwise/Full Document Contents/Tweets', '/tmp/readwise/Tweets'),
    logError: vi.fn(),
    logMissingDirectory,
    runCycle,
    watch
  });

  await monitor.start();
  await vi.runAllTimersAsync();

  expect(runCycle).toHaveBeenCalledTimes(expectedCycleCount);
  if (expectedMissingPaths.length > 0) {
    expect(logMissingDirectory).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'draft-import-source-1' }), expectedMissingPaths);
  } else {
    expect(logMissingDirectory).not.toHaveBeenCalled();
  }
  expect(monitor.isSnapshotFresh('draft-import-source-1')).toBe(expectedCycleCount > 0);

  monitor.stop();
  vi.useRealTimers();
});

it('keeps non-missing watch failures on the existing auto cycle failure path', async () => {
  vi.useFakeTimers();
  const logError = vi.fn();
  const watchError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
  const monitor = createKeepImportMonitor({
    debounceMs: 0,
    loadSettings: () => createReadwiseSettings('/tmp/readwise/Full Document Contents/Tweets', '/tmp/readwise/Tweets'),
    logError,
    logMissingDirectory: vi.fn(),
    runCycle: vi.fn(async () => undefined),
    watch: vi.fn(() => {
      throw watchError;
    })
  });

  await monitor.start();
  await vi.runAllTimersAsync();

  expect(logError).toHaveBeenCalledWith(
    '[keep-import] auto cycle failed for /tmp/readwise/Full Document Contents/Tweets',
    watchError
  );

  monitor.stop();
  vi.useRealTimers();
});
