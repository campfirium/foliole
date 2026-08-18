// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const countPresentKeepImportItems = vi.hoisted(() => vi.fn(() => 1097));
const requestKeepImportRuleRun = vi.hoisted(() => vi.fn());

vi.mock('../database/keepImportItems.js', () => ({
  countPresentKeepImportItems
}));

vi.mock('./keepImportMonitorRuntime.js', () => ({
  isKeepImportMonitorSnapshotFresh: vi.fn(() => true)
}));

vi.mock('./keepImportService.js', () => ({
  requestKeepImportRuleRun
}));

vi.mock('./importManagerSettings.js', () => ({
  loadImportManagerSettings: vi.fn(),
  saveImportManagerSettings: vi.fn((settings) => settings)
}));

vi.mock('../database/readwiseDeviceAssignment.js', () => ({
  canCurrentDeviceRunReadwise: vi.fn(() => true)
}));

import { runReadwiseReaderImport } from './readwiseReaderImportRun.js';

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
  countPresentKeepImportItems.mockClear();
  requestKeepImportRuleRun.mockClear();
});

it('uses a fresh keep monitor snapshot instead of rescanning unchanged Readwise sources', async () => {
  await expect(runReadwiseReaderImport({ settings: createSettings() })).resolves.toMatchObject({
    entry_count: 1097,
    imported_count: 0,
    skipped_count: 1097,
    source_count: 1,
    status: 'completed'
  });

  expect(requestKeepImportRuleRun).not.toHaveBeenCalled();
  expect(countPresentKeepImportItems).toHaveBeenCalledWith('draft-import-source-1');
});
