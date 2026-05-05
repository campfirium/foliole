// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import { handleInvokeRequest } from './commands.js';

const { readFile, runPreparedImport, showOpenDialog } = vi.hoisted(() => ({
  readFile: vi.fn().mockResolvedValue('# Imported title\nBody'),
  runPreparedImport: vi.fn(),
  showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/tmp/first.md', '/tmp/second.md'] })
}));

const mockWindow = {
  close: vi.fn(),
  isMaximized: vi.fn(() => false),
  maximize: vi.fn(),
  minimize: vi.fn(),
  webContents: { toggleDevTools: vi.fn() },
  unmaximize: vi.fn()
};

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => mockWindow),
    getFocusedWindow: vi.fn(() => mockWindow)
  },
  app: { getVersion: () => '1.0.0' },
  dialog: { showOpenDialog },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) }
}));

vi.mock('node:fs/promises', () => ({
  default: { readFile },
  readFile
}));

vi.mock('../database/importPipeline.js', () => ({
  recordPreparedImportFailure: vi.fn(),
  runPreparedImport
}));

vi.mock('./menu.js', () => ({ syncAppMenuState: vi.fn() }));
vi.mock('./paths.js', () => ({ resolveAppPaths: vi.fn() }));
vi.mock('./storageCommands.js', () => ({ handleStorageCommand: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./boot.js', () => ({ bootReport: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./review.js', () => ({
  reviewGrade: vi.fn(),
  reviewPreview: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/first.md', '/tmp/second.md'] });
  runPreparedImport
    .mockReturnValueOnce({
      contentFingerprint: 'content-fingerprint-1',
      degradedReason: null,
      duplicateSemantic: 'new',
      failureReason: null,
      importId: 'import-1',
      importedAt: '2026-03-22T10:00:00.000Z',
      nodeId: 'node-import-1',
      provider: 'desktop_text_file',
      resultStatus: 'imported',
      sourceFingerprint: 'source-fingerprint-1',
      sourceKind: 'markdown',
      sourceLocator: '/tmp/first.md',
      sourceName: 'first.md'
    })
    .mockReturnValueOnce({
      contentFingerprint: 'content-fingerprint-2',
      degradedReason: null,
      duplicateSemantic: 'new',
      failureReason: null,
      importId: 'import-2',
      importedAt: '2026-03-22T10:01:00.000Z',
      nodeId: 'node-import-2',
      provider: 'desktop_text_file',
      resultStatus: 'imported',
      sourceFingerprint: 'source-fingerprint-2',
      sourceKind: 'markdown',
      sourceLocator: '/tmp/second.md',
      sourceName: 'second.md'
    });
});

it('runs multi-file text imports through the native import command', async () => {
  await expect(handleInvokeRequest({ command: 'run_text_file_import', args: {} })).resolves.toEqual({
    content_fingerprint: 'content-fingerprint-2',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: null,
    import_id: 'import-2',
    imported_at: '2026-03-22T10:01:00.000Z',
    node_id: 'node-import-2',
    provider: 'desktop_text_file',
    result_status: 'imported',
    source_fingerprint: 'source-fingerprint-2',
    source_kind: 'markdown',
    source_locator: '/tmp/second.md',
    source_name: 'second.md'
  });

  expect(runPreparedImport).toHaveBeenCalledTimes(2);
});
