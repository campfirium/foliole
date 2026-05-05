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
  registerAttachmentProtocol: vi.fn(),
  resolveAppPaths: vi.fn(() => ({ app_log_dir: '/logs' }))
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  },
  app: mocks.app
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
vi.mock('./startupTasks.js', () => ({ runStartupTask: vi.fn() }));
vi.mock('./sync/desktopCompanionSyncPreference.js', () => ({ isDesktopCompanionSyncEnabled: vi.fn(() => false) }));
vi.mock('./sync/lanWorkspaceSyncServer.js', () => ({
  ensureLanWorkspaceSyncServer: vi.fn(),
  setLanWorkspaceSyncPairRequestHandler: vi.fn(),
  stopLanWorkspaceSyncServer: vi.fn().mockResolvedValue(undefined)
}));

afterEach(() => {
  vi.clearAllMocks();
});

it('keeps a window alive and loads the startup error surface when database startup fails', async () => {
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
    expect(loadMainWindow).toHaveBeenCalled();
  });

  expect(installInvokeHandler).toHaveBeenCalledTimes(1);
  expect(createMainWindow).toHaveBeenCalledWith({ kind: 'booting' });
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
