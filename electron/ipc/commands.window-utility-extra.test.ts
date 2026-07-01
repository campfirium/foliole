// @vitest-environment node
import path from 'node:path';

import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvokeRequest } from '../../lib/platform/nativeContract.js';

import { handleInvokeRequest } from './commands.js';

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
  requestDevShellRestart,
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
    getLoginItemSettings: vi.fn(() => ({
      executableWillLaunchAtLogin: true,
      openAtLogin: false
    })),
    getPath: vi.fn((name: string) => ({ crashDumps: '/crash', desktop: '/desktop', logs: '/log' })[name] ?? '/tmp'),
    getVersion: () => '1.0.0',
    isPackaged: false,
    relaunch: vi.fn(),
    setLoginItemSettings: vi.fn()
  },
  mockWindow: {
    close: vi.fn(),
    hide: vi.fn(),
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
  requestDevShellRestart: vi.fn(() => false),
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
vi.mock('../devShellRestartRequest.js', () => ({ requestDevShellRestart }));
vi.mock('./paths.js', () => ({
  resolveAppPaths: vi.fn().mockReturnValue({
    app_cache_dir: '/cache',
    app_config_dir: '/config',
    app_data_dir: '/data',
    app_log_dir: '/log',
    documents_dir: '/documents'
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
vi.mock('../database/importPipeline.js', () => ({ recordPreparedImportFailure, runPreparedImport }));
vi.mock('./storage.js', () => ({ loadAppSettingsState: vi.fn().mockResolvedValue({}), saveAppSettingsState: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../reviewSchedulerSettings.js', () => ({
  loadReviewSchedulerSettings: vi.fn().mockReturnValue(defaultReviewSchedulerSettings),
  saveReviewSchedulerSettings: vi.fn().mockReturnValue(defaultReviewSchedulerSettings)
}));
vi.mock('./boot.js', () => ({ appendBootEvent: vi.fn(), bootReport: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./review.js', () => ({ reviewGrade: vi.fn().mockReturnValue({ card: {}, reviewed_at: '2026-03-04T00:00:00.000Z' }) }));

beforeEach(() => {
  vi.clearAllMocks();
  requestDevShellRestart.mockReturnValue(false);
  mockApp.isPackaged = false;
  mockApp.getLoginItemSettings.mockReturnValue({
    executableWillLaunchAtLogin: true,
    openAtLogin: false
  });
  mockWindow.isMaximized.mockReturnValue(false);
});

it('loads unsupported login item settings outside the packaged Windows app', async () => {
  await expect(handleInvokeRequest({ command: 'load_login_item_settings' })).resolves.toEqual({
    enabled: false,
    effective: false,
    supported: false
  });

  expect(mockApp.getLoginItemSettings).not.toHaveBeenCalled();
});

it('saves login item settings only when supported', async () => {
  await expect(handleInvokeRequest({
    command: 'save_login_item_settings',
    args: { enabled: true }
  })).resolves.toEqual({
    enabled: false,
    effective: false,
    supported: false
  });

  expect(mockApp.setLoginItemSettings).not.toHaveBeenCalled();
});

it('handles typed native utility commands', async () => {
  const openExternalUrlRequest = {
    command: 'open_external_url',
    args: { url: 'https://example.com' }
  } satisfies NativeInvokeRequest<'open_external_url'>;
  const openLocalPathRequest = {
    command: 'open_local_path',
    args: { path: '/log/source.md' }
  } satisfies NativeInvokeRequest<'open_local_path'>;

  await expect(handleInvokeRequest(openExternalUrlRequest)).resolves.toBeNull();
  await expect(handleInvokeRequest(openLocalPathRequest)).resolves.toBeNull();
  await expect(handleInvokeRequest({
    command: 'sync_app_menu_state',
    args: { enabledCommandIds: ['node.create'], shortcutAccelerators: [] }
  } satisfies NativeInvokeRequest<'sync_app_menu_state'>)).resolves.toBeNull();
  await expect(handleInvokeRequest({ command: 'copy_diagnostic_report' })).resolves.toEqual({
    report_text: '# Foliole Diagnostic Report',
    status: 'generated'
  });
  expect(openExternal).toHaveBeenCalledWith('https://example.com');
  expect(openPath).toHaveBeenCalledWith(path.normalize('/log/source.md'));
  expect(syncAppMenuState).toHaveBeenCalledWith(['node.create'], []);
});

it('does not open rejected local paths through the native utility command', async () => {
  await expect(
    handleInvokeRequest({
      command: 'open_local_path',
      args: { path: 'file:///tmp/source.md' }
    })
  ).resolves.toBeNull();
  await expect(
    handleInvokeRequest({
      command: 'open_local_path',
      args: { path: '/tmp/install.exe' }
    })
  ).resolves.toBeNull();
  await expect(
    handleInvokeRequest({
      command: 'open_local_path',
      args: { path: '/tmp' }
    })
  ).resolves.toBeNull();

  expect(openPath).not.toHaveBeenCalled();
});

it('opens app-managed log directories through the native utility command', async () => {
  await expect(
    handleInvokeRequest({
      command: 'open_local_path',
      args: { path: '/log' }
    })
  ).resolves.toBeNull();

  expect(openPath).toHaveBeenCalledWith(path.normalize('/log'));
});

it('handles the dev app restart command through a shell restart request', async () => {
  requestDevShellRestart.mockReturnValue(true);

  await expect(handleInvokeRequest({ command: 'window_restart_dev_app' })).resolves.toBeNull();

  expect(requestDevShellRestart).toHaveBeenCalledWith({ reason: 'in-app-dev-restart' });
  expect(mockApp.relaunch).not.toHaveBeenCalled();
  expect(mockApp.exit).toHaveBeenCalledWith(0);
});

it('handles window commands through invoke channel', async () => {
  await expect(handleInvokeRequest({ command: 'window_minimize' })).resolves.toBeNull();
  await expect(handleInvokeRequest({ command: 'window_restart_app' })).resolves.toBeNull();
  await expect(handleInvokeRequest({ command: 'window_toggle_dev_tools' })).resolves.toBeNull();
  await expect(handleInvokeRequest({ command: 'window_toggle_maximize' })).resolves.toBeNull();
  await expect(handleInvokeRequest({ command: 'window_close' })).resolves.toBeNull();
  await expect(handleInvokeRequest({ command: 'window_is_maximized' })).resolves.toBe(false);

  expect(mockWindow.minimize).toHaveBeenCalledTimes(1);
  expect(mockApp.relaunch).toHaveBeenCalledTimes(1);
  expect(mockApp.exit).toHaveBeenCalledWith(0);
  expect(mockWindow.webContents.toggleDevTools).toHaveBeenCalledTimes(1);
  expect(mockWindow.maximize).toHaveBeenCalledTimes(1);
  expect(mockWindow.hide).toHaveBeenCalledTimes(1);
  expect(mockWindow.close).not.toHaveBeenCalled();
});

it('does not open DevTools from packaged native window command', async () => {
  mockApp.isPackaged = true;

  await expect(handleInvokeRequest({ command: 'window_toggle_dev_tools' })).resolves.toBeNull();

  expect(mockWindow.webContents.toggleDevTools).not.toHaveBeenCalled();
});

it('flushes dirty node sync versions through invoke channel', async () => {
  await expect(
    handleInvokeRequest({
      command: 'flush_dirty_node_sync_versions'
    } satisfies NativeInvokeRequest<'flush_dirty_node_sync_versions'>)
  ).resolves.toEqual(['node-1']);

  expect(flushAllDirtyNodeSyncVersions).toHaveBeenCalledTimes(1);
});

it('restores window when toggle command runs while maximized', async () => {
  mockWindow.isMaximized.mockReturnValue(true);

  await expect(handleInvokeRequest({ command: 'window_toggle_maximize' })).resolves.toBeNull();
  expect(mockWindow.unmaximize).toHaveBeenCalledTimes(1);
});
