// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import { handleInvokeRequest } from './commands.js';

const {
  loadReadwiseBookEpub,
  mockWindow,
  openReadwiseBookDownload,
  previewReadwiseReaderImport,
  resetReadwiseBookImport,
  runReadwiseReaderImport
} = vi.hoisted(() => ({
  loadReadwiseBookEpub: vi.fn(),
  mockWindow: {
    close: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isMaximized: vi.fn(() => false),
    maximize: vi.fn(),
    minimize: vi.fn(),
    unmaximize: vi.fn(),
    webContents: { send: vi.fn(), toggleDevTools: vi.fn() }
  },
  openReadwiseBookDownload: vi.fn(),
  previewReadwiseReaderImport: vi.fn(),
  resetReadwiseBookImport: vi.fn(),
  runReadwiseReaderImport: vi.fn()
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => mockWindow),
    getAllWindows: vi.fn(() => [mockWindow]),
    getFocusedWindow: vi.fn(() => mockWindow)
  },
  app: { exit: vi.fn(), getVersion: () => '1.0.0', relaunch: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openExternal: vi.fn(), openPath: vi.fn() }
}));

vi.mock('../import/readwiseBookManualActions.js', () => ({
  loadReadwiseBookEpub,
  openReadwiseBookDownload
}));
vi.mock('../import/readwiseBookImportReset.js', () => ({
  resetReadwiseBookImport
}));
vi.mock('../import/readwiseReaderImportRun.js', () => ({ runReadwiseReaderImport }));
vi.mock('../import/readwiseSyncPreview.js', () => ({ previewReadwiseReaderImport }));
vi.mock('./menu.js', () => ({ syncAppMenuState: vi.fn() }));
vi.mock('./paths.js', () => ({
  resolveAppPaths: vi.fn().mockReturnValue({
    app_cache_dir: '/cache',
    app_config_dir: '/config',
    app_data_dir: '/data',
    app_log_dir: '/log'
  })
}));
vi.mock('./storage.js', () => ({
  loadAppSettingsState: vi.fn().mockResolvedValue({}),
  saveAppSettingsState: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('../reviewSchedulerSettings.js', () => ({
  loadReviewSchedulerSettings: vi.fn().mockReturnValue({}),
  saveReviewSchedulerSettings: vi.fn().mockReturnValue({})
}));
vi.mock('./boot.js', () => ({ bootReport: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./review.js', () => ({
  reviewGrade: vi.fn().mockReturnValue({ reviewed_at: '2026-03-04T00:00:00.000Z', card: {} }),
  reviewPreview: vi.fn().mockReturnValue(null)
}));
vi.mock('./storageCommands.js', () => ({
  handleStorageCommand: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('../import/keepImportService.js', () => ({ previewKeepImportRule: vi.fn() }));
vi.mock('./importTextFile.js', () => ({
  runTextFileImport: vi.fn(),
  selectImportTextFile: vi.fn()
}));
vi.mock('./importClipboard.js', () => ({ runClipboardImport: vi.fn() }));
vi.mock('./importDirectory.js', () => ({ runDirectoryImport: vi.fn() }));
vi.mock('./fonts.js', () => ({ listSystemFonts: vi.fn() }));
vi.mock('./readwiseReaderSetup.js', () => ({ inspectReadwiseReaderSetup: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  openReadwiseBookDownload.mockResolvedValue({
    book_key: 'book-1',
    status: 'opened',
    title: 'Book 1',
    url: 'https://example.com'
  });
  loadReadwiseBookEpub.mockResolvedValue({
    book_key: 'book-1',
    epub_path: '/tmp/book.epub',
    status: 'selected',
    title: 'Book 1'
  });
  resetReadwiseBookImport.mockResolvedValue({
    book_key: 'book-1',
    content: '# Book 1',
    node_id: 'node-book-1',
    removed_node_ids: ['node-book-1-chapter'],
    status: 'reset',
    title: 'Book 1',
    updated_at: '2026-04-04T00:00:00.000Z'
  });
  previewReadwiseReaderImport.mockResolvedValue({ entries: [], total_count: 0, write_count: 0 });
  runReadwiseReaderImport.mockResolvedValue({
    completed_at: '2026-05-11T00:00:00.000Z',
    failed_count: 0,
    source_count: 1,
    status: 'completed'
  });
});

it('routes readwise book manual actions through the native invoke handler', async () => {
  await expect(
    handleInvokeRequest({
      command: 'open_readwise_book_download',
      args: { node_id: 'node-book-1' }
    })
  ).resolves.toEqual({
    book_key: 'book-1',
    status: 'opened',
    title: 'Book 1',
    url: 'https://example.com'
  });
  await expect(
    handleInvokeRequest({ command: 'load_readwise_book_epub', args: { node_id: 'node-book-1' } })
  ).resolves.toEqual({
    book_key: 'book-1',
    epub_path: '/tmp/book.epub',
    status: 'selected',
    title: 'Book 1'
  });
  await expect(
    handleInvokeRequest({ command: 'reset_readwise_book_import', args: { node_id: 'node-book-1' } })
  ).resolves.toEqual({
    book_key: 'book-1',
    content: '# Book 1',
    node_id: 'node-book-1',
    removed_node_ids: ['node-book-1-chapter'],
    status: 'reset',
    title: 'Book 1',
    updated_at: '2026-04-04T00:00:00.000Z'
  });

  expect(openReadwiseBookDownload).toHaveBeenCalledWith('node-book-1');
  expect(loadReadwiseBookEpub).toHaveBeenCalledWith('node-book-1', mockWindow);
  expect(resetReadwiseBookImport).toHaveBeenCalledWith('node-book-1');
});

it('routes Readwise Reader preview and run commands through native invoke', async () => {
  await expect(
    handleInvokeRequest({
      command: 'preview_readwise_reader_import',
      args: { settings: { readwiseRootPath: '/Readwise' } }
    })
  ).resolves.toMatchObject({ total_count: 0 });
  await expect(
    handleInvokeRequest({
      command: 'run_readwise_reader_import',
      args: { settings: { readwiseRootPath: '/Readwise' } }
    })
  ).resolves.toMatchObject({ status: 'completed' });

  expect(previewReadwiseReaderImport).toHaveBeenCalledWith({ readwiseRootPath: '/Readwise' });
  expect(runReadwiseReaderImport).toHaveBeenCalledWith({
    settings: { readwiseRootPath: '/Readwise' }
  });
});
