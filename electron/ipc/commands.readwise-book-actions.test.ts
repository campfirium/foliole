// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import { handleInvokeRequest } from './commands.js';

const { loadReadwiseBookEpub, mockWindow, openReadwiseBookDownload } = vi.hoisted(() => ({
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
  openReadwiseBookDownload: vi.fn()
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
vi.mock('./storageCommands.js', () => ({ handleStorageCommand: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../import/keepImportService.js', () => ({ previewKeepImportRule: vi.fn() }));
vi.mock('./importTextFile.js', () => ({
  runTextFileImport: vi.fn(),
  selectImportTextFile: vi.fn()
}));
vi.mock('./importDirectory.js', () => ({ runDirectoryImport: vi.fn() }));
vi.mock('./fonts.js', () => ({ listSystemFonts: vi.fn() }));
vi.mock('./readwiseReaderSetup.js', () => ({ inspectReadwiseReaderSetup: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  openReadwiseBookDownload.mockResolvedValue({ book_key: 'book-1', status: 'opened', title: 'Book 1', url: 'https://example.com' });
  loadReadwiseBookEpub.mockResolvedValue({ book_key: 'book-1', epub_path: '/tmp/book.epub', status: 'selected', title: 'Book 1' });
});

it('routes readwise book manual actions through the native invoke handler', async () => {
  await expect(
    handleInvokeRequest({ command: 'open_readwise_book_download', args: { node_id: 'node-book-1' } })
  ).resolves.toEqual({ book_key: 'book-1', status: 'opened', title: 'Book 1', url: 'https://example.com' });
  await expect(
    handleInvokeRequest({ command: 'load_readwise_book_epub', args: { node_id: 'node-book-1' } })
  ).resolves.toEqual({ book_key: 'book-1', epub_path: '/tmp/book.epub', status: 'selected', title: 'Book 1' });

  expect(openReadwiseBookDownload).toHaveBeenCalledWith('node-book-1');
  expect(loadReadwiseBookEpub).toHaveBeenCalledWith('node-book-1', mockWindow);
});
