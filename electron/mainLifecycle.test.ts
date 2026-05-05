// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendBootEvent: vi.fn().mockResolvedValue(undefined),
  appendMainProcessDiagnosticLog: vi.fn(),
  app: {
    on: vi.fn(),
    quit: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => true),
    whenReady: vi.fn()
  },
  initializeDatabase: vi.fn(),
  installAppMenu: vi.fn(),
  loadStartupSkeletonAppearance: vi.fn(() => ({
    backgroundColor: '#1f211f',
    css: '--startup-list-width:512px;',
    themeSource: 'dark'
  })),
  nativeTheme: {
    themeSource: 'system'
  },
  registerAttachmentProtocol: vi.fn(),
  resolveAppPaths: vi.fn(() => ({ app_log_dir: '/logs' })),
  setRuntimeStartupTokensCss: vi.fn()
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  },
  app: mocks.app,
  nativeTheme: mocks.nativeTheme
}));
vi.mock('./attachments/attachmentProtocol.js', () => ({ registerAttachmentProtocol: mocks.registerAttachmentProtocol }));
vi.mock('./database/backupRestore.js', () => ({ reconcileAutomaticDatabaseBackups: vi.fn() }));
vi.mock('./database/migrate.js', () => ({ initializeDatabase: mocks.initializeDatabase }));
vi.mock('./database/nodeMutations.js', () => ({ flushAllDirtyNodeSyncVersions: vi.fn() }));
vi.mock('./database/pdfIndexing.js', () => ({ resumePendingPdfAttachmentIndexing: vi.fn() }));
vi.mock('./devRendererReloadIntent.js', () => ({ installDevRendererReloadIntentWatcher: vi.fn(() => null) }));
vi.mock('./devRestartIntent.js', () => ({ installDevRestartIntentWatcher: vi.fn(() => null) }));
vi.mock('./diagnostics/mainProcessDiagnostics.js', () => ({
  appendMainProcessDiagnosticLog: mocks.appendMainProcessDiagnosticLog
}));
vi.mock('./externalSearchBackgroundRefreshRuntime.js', () => ({
  notifyExternalSearchSecondInstance: vi.fn(),
  notifyExternalSearchUserActivity: vi.fn(),
  startExternalSearchBackgroundRefresh: vi.fn(),
  stopExternalSearchBackgroundRefresh: vi.fn()
}));
vi.mock('./import/keepImportMonitor.js', () => ({ startKeepImportMonitor: vi.fn(), stopKeepImportMonitor: vi.fn() }));
vi.mock('./import/managedInboxMonitor.js', () => ({ startManagedInboxMonitor: vi.fn(), stopManagedInboxMonitor: vi.fn() }));
vi.mock('./import/readwiseBooksInventory.js', () => ({ loadReadwiseBooksInventory: vi.fn() }));
vi.mock('./ipc/boot.js', () => ({ appendBootEvent: mocks.appendBootEvent }));
vi.mock('./ipc/legacyWebviewStorage.js', () => ({ migrateLegacyWebviewStorage: vi.fn() }));
vi.mock('./ipc/menu.js', () => ({ installAppMenu: mocks.installAppMenu }));
vi.mock('./ipc/paths.js', () => ({ resolveAppPaths: mocks.resolveAppPaths }));
vi.mock('./mirror/mirrorSyncScheduler.js', () => ({ flushMirrorSync: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./mirror/rebuildMirrorOutput.js', () => ({ backfillMissingMirrorOutput: vi.fn() }));
vi.mock('./runtimeMainSupport.js', () => ({
  bindEmbeddedLinkPanelContents: vi.fn(),
  focusWindow: vi.fn(),
  installMainRuntimeDiagnostics: vi.fn()
}));
vi.mock('./runtimeStartupTokens.js', () => ({
  setRuntimeStartupTokensCss: mocks.setRuntimeStartupTokensCss
}));
vi.mock('./startupSkeletonLayout.js', () => ({ loadStartupSkeletonAppearance: mocks.loadStartupSkeletonAppearance }));
vi.mock('./startupTasks.js', () => ({ runStartupTask: vi.fn() }));
vi.mock('./sync/desktopCompanionSyncPreference.js', () => ({ isDesktopCompanionSyncEnabled: vi.fn(() => false) }));
vi.mock('./sync/lanWorkspaceSyncServer.js', () => ({
  ensureLanWorkspaceSyncServer: vi.fn(),
  setLanWorkspaceSyncPairRequestHandler: vi.fn(),
  stopLanWorkspaceSyncServer: vi.fn().mockResolvedValue(undefined)
}));

afterEach(() => {
  vi.clearAllMocks();
  mocks.initializeDatabase.mockReset();
  mocks.loadStartupSkeletonAppearance.mockReturnValue({
    backgroundColor: '#1f211f',
    css: '--startup-list-width:512px;',
    themeSource: 'dark'
  });
  mocks.nativeTheme.themeSource = 'system';
  mocks.setRuntimeStartupTokensCss.mockClear();
  vi.resetModules();
});

it('creates a hidden themed window and loads the real workspace after runtime services are ready', async () => {
  const window = {
    isDestroyed: vi.fn(() => false)
  };
  const createMainWindow = vi.fn().mockResolvedValue(window);
  const installInvokeHandler = vi.fn();
  const loadMainWindow = vi.fn().mockResolvedValue(undefined);
  mocks.app.whenReady.mockResolvedValue(undefined);

  const { installMainLifecycle } = await import('./mainLifecycle.js');
  installMainLifecycle({
    createMainWindow,
    installInvokeHandler,
    loadMainWindow,
    runtimeMode: { allowParallelInstance: true } as never
  });
  await vi.waitFor(() => {
    expect(mocks.appendBootEvent).toHaveBeenCalledWith('main_window_ready');
  });

  expect(installInvokeHandler).toHaveBeenCalledTimes(1);
  expect(mocks.loadStartupSkeletonAppearance).toHaveBeenCalledTimes(1);
  expect(mocks.setRuntimeStartupTokensCss).toHaveBeenCalledWith('--startup-list-width:512px;');
  expect(mocks.nativeTheme.themeSource).toBe('dark');
  expect(mocks.initializeDatabase).toHaveBeenCalledTimes(1);
  expect(createMainWindow).toHaveBeenCalledWith({
    backgroundColor: '#1f211f'
  });
  expect(createMainWindow).toHaveBeenCalledTimes(1);
  expect(loadMainWindow).toHaveBeenCalledWith(window);
});

it('keeps the startup window alive and loads the startup error surface when database startup fails', async () => {
  const window = {
    isDestroyed: vi.fn(() => false)
  };
  const createMainWindow = vi.fn().mockResolvedValue(window);
  const installInvokeHandler = vi.fn();
  const loadMainWindow = vi.fn().mockResolvedValue(undefined);
  mocks.initializeDatabase.mockImplementation(() => {
    throw new Error('migration exploded');
  });
  mocks.app.whenReady.mockResolvedValue(undefined);

  const { installMainLifecycle } = await import('./mainLifecycle.js');
  installMainLifecycle({
    createMainWindow,
    installInvokeHandler,
    loadMainWindow,
    runtimeMode: { allowParallelInstance: true } as never
  });
  await vi.waitFor(() => {
    expect(createMainWindow).toHaveBeenCalled();
  });

  expect(installInvokeHandler).toHaveBeenCalledTimes(1);
  expect(createMainWindow).toHaveBeenCalledWith({
    backgroundColor: '#1f211f'
  });
  expect(loadMainWindow).toHaveBeenCalledWith(window, {
    errorSummary: 'migration exploded',
    kind: 'startup-error',
    logPath: '/logs',
    moduleLabel: 'Database migration'
  });
  expect(mocks.appendMainProcessDiagnosticLog).toHaveBeenCalledWith(
    'startup_runtime_services_failed',
    expect.objectContaining({ error: expect.any(Error) })
  );
});
