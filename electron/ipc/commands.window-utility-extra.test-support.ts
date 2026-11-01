// @vitest-environment node
import { beforeEach, vi } from 'vitest';

vi.mock('../database/connection.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../database/connection.js')>(),
  runWithDatabaseConnectionOwner: vi.fn((execute: () => unknown) => execute())
}));

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
  drainDirtyNodeSyncVersions
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
  drainDirtyNodeSyncVersions: vi.fn(async () => ['node-1'])
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
  replaceNodeOrder: vi.fn(),
  restoreNodes: vi.fn(),
  softDeleteNodes: vi.fn(),
  upsertNodeSnapshot: vi.fn(),
  upsertNodeSnapshots: vi.fn()
}));
vi.mock('../database/nodeSyncVersionDrain.js', () => ({ drainDirtyNodeSyncVersions }));
vi.mock('../database/importPipeline.js', () => ({ recordPreparedImportFailure, runPreparedImport }));
vi.mock('./storage.js', () => ({ loadAppSettingsState: vi.fn().mockResolvedValue({}), saveAppSettingsState: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../reviewSchedulerSettings.js', () => ({
  loadReviewSchedulerSettings: vi.fn().mockReturnValue(defaultReviewSchedulerSettings),
  saveReviewSchedulerSettings: vi.fn().mockReturnValue(defaultReviewSchedulerSettings)
}));
vi.mock('./boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined), bootReport: vi.fn().mockResolvedValue(undefined) }));
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


export { drainDirtyNodeSyncVersions, mockApp, mockWindow, openExternal, openPath, requestDevShellRestart, syncAppMenuState };
