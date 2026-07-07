// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { handleInvokeRequest } from './commands.js';
import {
  failedMarkdownResult,
  importedHtmlResult,
  importedMarkdownResult
} from './commands.window-and-utility.test.fixtures.js';
const {
  defaultReviewSchedulerSettings,
  mockApp,
  mockWindow,
  openExternal,
  openPath,
  copyDiagnosticReport,
  readFile,
  recordPreparedImportFailure,
  runPreparedImport,
  showItemInFolder,
  showOpenDialog,
  syncAppMenuState,
  flushAllDirtyNodeSyncVersions
} = vi.hoisted(() => ({
  defaultReviewSchedulerSettings: {
    algorithm: 'ts-fsrs@5.4.0 using FSRS-6.0',
    desiredRetention: 0.9,
    maximumIntervalDays: 36500,
    enableShortTerm: false,
    pushQueue: {
      defaultPriority: 5,
      priorityRatio: 5,
      queueMixRatio: { reading: 1, fsrs: 5 },
      readingInitialIntervalMs: 24 * 60 * 60 * 1000,
      readingIntervalGrowthFactorRange: { min: 1.1, max: 1.5 }
    },
    updatedAt: '2026-03-06T00:00:00.000Z'
  },
  mockApp: {
    exit: vi.fn(),
    getPath: vi.fn((name: string) => ({ crashDumps: '/crash', desktop: '/desktop', logs: '/log' })[name] ?? '/tmp'),
    getVersion: () => '1.0.0',
    relaunch: vi.fn()
  },
  mockWindow: {
    close: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isMaximized: vi.fn(() => false),
    maximize: vi.fn(),
    minimize: vi.fn(),
    webContents: {
      executeJavaScript: vi.fn().mockResolvedValue(false),
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
      toggleDevTools: vi.fn()
    },
    unmaximize: vi.fn()
  },
  openExternal: vi.fn().mockResolvedValue(undefined),
  openPath: vi.fn().mockResolvedValue(''),
  copyDiagnosticReport: vi.fn().mockResolvedValue({
    report_text: '# Foliole Diagnostic Report',
    status: 'generated'
  }),
  readFile: vi.fn().mockResolvedValue('# Imported title\nBody'),
  recordPreparedImportFailure: vi.fn(),
  runPreparedImport: vi.fn(),
  showItemInFolder: vi.fn(),
  showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/tmp/inbox.md'] }),
  syncAppMenuState: vi.fn(),
  flushAllDirtyNodeSyncVersions: vi.fn(() => ['node-1'])
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => mockWindow),
    getAllWindows: vi.fn(() => [mockWindow]),
    getFocusedWindow: vi.fn(() => mockWindow)
  },
  app: mockApp,
  dialog: { showOpenDialog },
  shell: { openExternal, openPath, showItemInFolder }
}));
vi.mock('node:fs/promises', () => ({
  default: { readFile },
  readFile
}));
vi.mock('./menu.js', () => ({ syncAppMenuState }));
vi.mock('../diagnostics/diagnosticBundle.js', () => ({ copyDiagnosticReport }));
vi.mock('./paths.js', () => ({
  resolveAppPaths: vi.fn().mockReturnValue({
    app_data_dir: '/data',
    app_config_dir: '/config',
    app_cache_dir: '/cache',
    app_log_dir: '/log'
  })
}));
vi.mock('../database/nodeMutations.js', () => ({
  deleteNodesPermanently: vi.fn(),
  flushAllDirtyNodeSyncVersions,
  replaceNodeOrder: vi.fn(),
  restoreNodes: vi.fn(),
  softDeleteNodes: vi.fn(),
  upsertNodeSnapshot: vi.fn(),
  upsertNodeSnapshots: vi.fn()
}));
vi.mock('../database/importPipeline.js', () => ({
  recordPreparedImportFailure,
  runPreparedImport
}));
vi.mock('../import/importNodeMutationPatch.js', () => ({
  buildImportNodeMutationPatch: vi.fn(),
  withTextImportNodeMutationPatch: vi.fn((result) => result)
}));
vi.mock('./storage.js', () => ({
  loadAppSettingsState: vi.fn().mockResolvedValue({ 'foliole-ui-font-preset': 'inter' }),
  saveAppSettingsState: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('../reviewSchedulerSettings.js', () => ({
  loadReviewSchedulerSettings: vi.fn().mockReturnValue(defaultReviewSchedulerSettings),
  saveReviewSchedulerSettings: vi.fn().mockReturnValue(defaultReviewSchedulerSettings)
}));
vi.mock('./boot.js', () => ({
  appendBootEvent: vi.fn(),
  bootReport: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('./review.js', () => ({
  reviewGrade: vi.fn().mockReturnValue({ reviewed_at: '2026-03-04T00:00:00.000Z', card: {} })
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockWindow.isMaximized.mockReturnValue(false);
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/inbox.md'] });
  readFile.mockResolvedValue('# Imported title\nBody');
  runPreparedImport.mockReturnValue(importedMarkdownResult);
  recordPreparedImportFailure.mockReturnValue(failedMarkdownResult);
});

it('throws on unsupported command', async () => {
  await expect(handleInvokeRequest({ command: 'unknown.command' })).rejects.toThrow(
    'unsupported native command'
  );
});

it('selects a Markdown or TXT file through the native import command', async () => {
  await expect(handleInvokeRequest({ command: 'select_import_text_file', args: {} })).resolves.toEqual({
    content: '# Imported title\nBody',
    file_name: 'inbox.md',
    file_path: '/tmp/inbox.md',
    kind: 'markdown'
  });

  expect(showOpenDialog).toHaveBeenCalledTimes(1);
  expect(readFile).toHaveBeenCalledWith('/tmp/inbox.md', 'utf8');
});

it('selects a directory through the native utility command', async () => {
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/imports'] });

  await expect(handleInvokeRequest({ command: 'select_import_directory', args: {} })).resolves.toBe('/tmp/imports');
  expect(showOpenDialog).toHaveBeenCalledTimes(1);
});

it('runs the unified text import pipeline through the native import command', async () => {
  await expect(handleInvokeRequest({ command: 'run_text_file_import', args: {} })).resolves.toEqual({
    content_fingerprint: 'content-fingerprint',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: null,
    import_id: 'import-1',
    imported_at: '2026-03-22T10:00:00.000Z',
    node_id: 'node-import-1',
    provider: 'desktop_text_file',
    result_status: 'imported',
    source_fingerprint: 'source-fingerprint',
    source_kind: 'markdown',
    source_locator: '/tmp/inbox.md',
    source_name: 'inbox.md'
  });

  expect(runPreparedImport).toHaveBeenCalledTimes(1);
  expect(recordPreparedImportFailure).not.toHaveBeenCalled();
});

it('returns null when native import selection is cancelled', async () => {
  showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

  await expect(handleInvokeRequest({ command: 'select_import_text_file', args: {} })).resolves.toBeNull();
  expect(readFile).not.toHaveBeenCalled();
});

it('classifies TXT imports as text through the native import command', async () => {
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/inbox.txt'] });
  readFile.mockResolvedValue('Plain text body');

  await expect(handleInvokeRequest({ command: 'select_import_text_file', args: {} })).resolves.toEqual({
    content: 'Plain text body',
    file_name: 'inbox.txt',
    file_path: '/tmp/inbox.txt',
    kind: 'text'
  });

  expect(readFile).toHaveBeenCalledWith('/tmp/inbox.txt', 'utf8');
});

it('converts HTML files into markdown-compatible content through the native import command', async () => {
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/inbox.html'] });
  readFile.mockResolvedValue('<h2>Imported</h2><p><strong>Bold</strong> text</p>');
  runPreparedImport.mockReturnValue(importedHtmlResult);

  await expect(handleInvokeRequest({ command: 'select_import_text_file', args: {} })).resolves.toEqual({
    content: '## Imported\n\n**Bold** text',
    file_name: 'inbox.html',
    file_path: '/tmp/inbox.html',
    kind: 'html'
  });

  await expect(handleInvokeRequest({ command: 'run_text_file_import', args: {} })).resolves.toEqual({
    content_fingerprint: 'content-fingerprint',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: null,
    import_id: 'import-3',
    imported_at: '2026-03-22T10:20:00.000Z',
    node_id: 'node-import-3',
    provider: 'desktop_text_file',
    result_status: 'imported',
    source_fingerprint: 'source-fingerprint-html',
    source_kind: 'html',
    source_locator: '/tmp/inbox.html',
    source_name: 'inbox.html'
  });

  expect(runPreparedImport).toHaveBeenCalledWith(
    expect.objectContaining({
      content: '## Imported\n\n**Bold** text',
      sourceKind: 'html',
      sourceLocator: '/tmp/inbox.html',
      sourceName: 'inbox.html'
    })
  );
});
