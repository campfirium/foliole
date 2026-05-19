// @vitest-environment node

import path from 'node:path';

import { beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-book-manual-action-failure-tests';

const { openExternal, runEpubImport, showOpenDialog } = vi.hoisted(() => ({
  openExternal: vi.fn().mockResolvedValue(undefined),
  runEpubImport: vi.fn(),
  showOpenDialog: vi.fn()
}));
const primaryDeviceMock = vi.hoisted(() => ({
  canRunExternalSources: true
}));

vi.mock('electron', () => ({
  dialog: { showOpenDialog },
  shell: { openExternal }
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../sync/primaryDeviceState.js', () => ({
  canDesktopRunExternalSources: vi.fn(() => primaryDeviceMock.canRunExternalSources)
}));

vi.mock('../ipc/epubImport.js', () => ({
  runEpubImport
}));

vi.mock('./readwiseBooksInventoryLoad.js', () => ({
  loadReadwiseBooksInventory: vi.fn().mockResolvedValue({
    books: [
      {
        annotationStatus: 'has_highlights',
        bodyState: 'unloaded',
        bookKey: 'book-1',
        downloadUrl: 'https://readwise.io/reader/document_raw_content/1',
        epubPath: null,
        epubStatus: 'missing',
        fullDocumentMarkdownPath: '/tmp/book-1.md',
        generatedNodeId: 'node-book-1',
        highlightState: 'pending',
        highlightMarkdownPath: '/tmp/book-1-highlights.md',
        highlightUnmatchedCount: null,
        importStatus: 'pending',
        nodeStatus: 'generated',
        title: 'Book One'
      }
    ],
    fullDocumentDirectoryPath: '/tmp/books',
    highlightDirectoryPath: '/tmp/highlights',
    scannedAt: '2026-04-03T00:00:00.000Z'
  })
}));

vi.mock('./readwiseBooksInventoryState.js', () => ({
  findPersistedReadwiseBookByNodeId: vi.fn().mockReturnValue(null),
  savePersistedReadwiseBooksInventory: vi.fn()
}));

vi.mock('./readwiseBookHighlightPlacement.js', () => ({
  placeReadwiseBookHighlights: vi.fn().mockResolvedValue({ matchedCount: 0, unmatchedCount: 0 })
}));

vi.mock('./importManagerSettings.js', () => ({
  loadImportManagerSettings: vi.fn().mockReturnValue({
    readwiseReaderConfig: {}
  })
}));

vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: vi.fn(() => ({
    sqlite: { prepare: vi.fn(() => ({ run: vi.fn() })) }
  }))
}));

vi.mock('../database/settingsStore.js', () => ({
  loadJsonSetting: vi.fn().mockReturnValue(null),
  saveJsonSetting: vi.fn()
}));

vi.mock('../ipc/importSourcePipeline.js', () => ({
  resolveSingleFileImportSource: vi.fn((filePath: string) => ({
    filePath,
    kind: 'epub',
    sourceName: path.basename(filePath)
  }))
}));

import { loadReadwiseBookEpub, openReadwiseBookDownload } from './readwiseBookManualActions.js';

beforeEach(() => {
  mockedAppDataDir = '/tmp/foliole-readwise-book-manual-action-failure-tests';
  vi.clearAllMocks();
  primaryDeviceMock.canRunExternalSources = true;
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/broken.epub'] });
  runEpubImport.mockRejectedValue(new Error('broken epub'));
});

it('returns a failed result instead of throwing when epub import fails', async () => {
  await expect(loadReadwiseBookEpub('node-book-1')).resolves.toEqual({
    book_key: 'book-1',
    error_message: 'Could not load this original file. Please try another file.',
    epub_path: null,
    status: 'failed',
    title: 'Book One'
  });
});

it('blocks manual readwise download and original file import when this desktop is secondary', async () => {
  primaryDeviceMock.canRunExternalSources = false;

  await expect(openReadwiseBookDownload('node-book-1')).resolves.toEqual({
    book_key: 'book-1',
    status: 'blocked_secondary',
    title: 'Book One',
    url: null
  });
  await expect(loadReadwiseBookEpub('node-book-1')).resolves.toMatchObject({
    book_key: 'book-1',
    epub_path: null,
    status: 'blocked_secondary',
    title: 'Book One'
  });
  expect(openExternal).not.toHaveBeenCalled();
  expect(showOpenDialog).not.toHaveBeenCalled();
});
