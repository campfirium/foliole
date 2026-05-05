// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';

import { createKeepImportMonitor } from './keepImportMonitor.js';

it('watches both readwise full document and highlight folders', async () => {
  vi.useFakeTimers();
  const watch = vi.fn(() => ({ close: vi.fn() }));
  const monitor = createKeepImportMonitor({
    debounceMs: 0,
    loadSettings: () => ({
      ...createDefaultImportManagerSettings(),
      readwiseReaderConfig: {
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
