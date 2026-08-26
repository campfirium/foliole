// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  appendBootEvent: vi.fn().mockResolvedValue(undefined),
  appendMainProcessDiagnosticLog: vi.fn(),
  app: {
    getAppPath: vi.fn(() => '/app'),
    getVersion: vi.fn(() => '0.1.0-test'),
    isPackaged: false,
    on: vi.fn(),
    quit: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => true),
    whenReady: vi.fn()
  },
  initializeDatabase: vi.fn(),
  installAppMenu: vi.fn(),
  ensureAgentControlApiServer: vi.fn().mockResolvedValue(undefined),
  ensureLanWorkspaceSyncServer: vi.fn().mockResolvedValue(undefined),
  isDesktopCompanionSyncParticipating: vi.fn(() => false),
  prepareGlobalClipToInboxWindows: vi.fn(),
  presentInitialRendererWindow: vi.fn(),
  registerAttachmentProtocol: vi.fn(),
  registerExtDocImageProtocol: vi.fn(),
  registerRemoteImageProtocol: vi.fn(),
  resolveAppPaths: vi.fn(() => ({ app_cache_dir: '/cache', app_log_dir: '/logs' }))
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  },
  app: mocks.app
}));
vi.mock('./agentControl/agentControlServer.js', () => ({ ensureAgentControlApiServer: mocks.ensureAgentControlApiServer, stopAgentControlApiServer: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./attachments/attachmentProtocol.js', () => ({ registerAttachmentProtocol: mocks.registerAttachmentProtocol }));
vi.mock('./attachments/extDocImageProtocol.js', () => ({ registerExtDocImageProtocol: mocks.registerExtDocImageProtocol }));
vi.mock('./attachments/remoteImageProtocol.js', () => ({ registerRemoteImageProtocol: mocks.registerRemoteImageProtocol }));
vi.mock('./database/backupRestore.js', () => ({ reconcileAutomaticDatabaseBackups: vi.fn() }));
vi.mock('./database/deviceIdentity.js', () => ({ loadOrCreateDesktopDeviceId: vi.fn(() => 'device-desktop') }));
vi.mock('./database/migrate.js', () => ({ initializeDatabase: mocks.initializeDatabase }));
vi.mock('./database/nodeMutations.js', () => ({ flushAllDirtyNodeSyncVersions: vi.fn() }));
vi.mock('./database/pdfIndexing.js', () => ({ resumePendingPdfAttachmentIndexing: vi.fn() }));
vi.mock('./database/syncGroupIdentityStore.js', () => ({ updateLocalSyncGroupHostName: vi.fn() }));
vi.mock('./devRendererReloadIntent.js', () => ({ installDevRendererReloadIntentWatcher: vi.fn(() => null) }));
vi.mock('./devRestartIntent.js', () => ({ installDevRestartIntentWatcher: vi.fn(() => null) }));
vi.mock('./diagnostics/mainProcessDiagnostics.js', () => ({
  appendMainProcessDiagnosticLog: mocks.appendMainProcessDiagnosticLog
}));
function firstInvocationOrder(mock: { mock: { invocationCallOrder: number[] } }) {
  const [order] = mock.mock.invocationCallOrder;
  expect(order).toBeDefined();
  return order!;
}

vi.mock('./externalSearchBackgroundRefreshRuntime.js', () => ({
  notifyExternalSearchSecondInstance: vi.fn(),
  notifyExternalSearchUserActivity: vi.fn(),
  startExternalSearchBackgroundRefresh: vi.fn(),
  stopExternalSearchBackgroundRefresh: vi.fn()
}));
vi.mock('./globalClipToastNavigation.js', () => ({ installGlobalCaptureToastOpenHandler: vi.fn() }));
vi.mock('./globalClipShortcut.js', () => ({
  installGlobalClipShortcut: vi.fn(),
  refreshGlobalClipShortcutFromSettings: vi.fn()
}));
vi.mock('./globalClipToInbox.js', () => ({
  prepareGlobalClipToInboxWindows: mocks.prepareGlobalClipToInboxWindows,
  runGlobalClipToInbox: vi.fn()
}));
vi.mock('./initialLibrarySetup.js', () => ({
  initializeRuntimeServicesAfterLibrarySetup: vi.fn(async (_preparation: unknown, initialize: () => Promise<void>, after?: () => void) => {
    await initialize();
    after?.();
  }),
  prepareInitialLibrarySetup: vi.fn(() => null),
  quitIfInitialLibrarySetupIsAbandoned: vi.fn()
}));
vi.mock('./backgroundPresence.js', () => ({
  installBackgroundTray: vi.fn(),
  markAppQuittingForBackgroundPresence: vi.fn()
}));
vi.mock('./import/keepImportMonitor.js', () => ({ startKeepImportMonitor: vi.fn(), stopKeepImportMonitor: vi.fn() }));
vi.mock('./import/managedInboxMonitor.js', () => ({ startManagedInboxMonitor: vi.fn(), stopManagedInboxMonitor: vi.fn() }));
vi.mock('./ipc/boot.js', () => ({ appendBootEvent: mocks.appendBootEvent }));
vi.mock('./ipc/legacyWebviewStorage.js', () => ({ migrateLegacyWebviewStorage: vi.fn() }));
vi.mock('./ipc/menu.js', () => ({ installAppMenu: mocks.installAppMenu }));
vi.mock('./ipc/paths.js', () => ({ resolveAppPaths: mocks.resolveAppPaths }));
vi.mock('./mirror/mirrorSyncScheduler.js', () => ({ flushMirrorSync: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./mirror/rebuildMirrorOutput.js', () => ({ backfillMissingMirrorOutput: vi.fn() }));
vi.mock('./runtimeMainSupport.js', () => ({
  bindEmbeddedLinkPanelContents: vi.fn(),
  bindMainWindowNavigationGuard: vi.fn(),
  focusWindow: vi.fn(),
  installMainRuntimeDiagnostics: vi.fn()
}));
vi.mock('./windowRuntimeDiagnostics.js', () => ({
  applyStartupWindowPresentation: vi.fn(),
  presentInitialRendererWindow: mocks.presentInitialRendererWindow
}));
vi.mock('./startupTasks.js', () => ({ runStartupTask: vi.fn() }));
vi.mock('./sync/desktopCompanionSyncPreference.js', () => ({
  isDesktopCompanionSyncParticipating: mocks.isDesktopCompanionSyncParticipating
}));
vi.mock('./sync/lanWorkspaceSyncServer.js', () => ({
  ensureLanWorkspaceSyncServer: mocks.ensureLanWorkspaceSyncServer,
  setLanWorkspaceSyncJoinRequestHandler: vi.fn(),
  stopLanWorkspaceSyncServer: vi.fn().mockResolvedValue(undefined)
}));

afterEach(() => {
  vi.clearAllMocks();
  mocks.initializeDatabase.mockReset();
  mocks.ensureLanWorkspaceSyncServer.mockReset();
  mocks.ensureLanWorkspaceSyncServer.mockResolvedValue(undefined);
  mocks.isDesktopCompanionSyncParticipating.mockReset();
  mocks.isDesktopCompanionSyncParticipating.mockReturnValue(false);
  mocks.presentInitialRendererWindow.mockClear();
  vi.resetModules();
});

it('loads the static workspace shell before runtime services and activates React after services are ready', async () => {
  const window = {
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    show: vi.fn()
  };
  const activateMainWindow = vi.fn().mockResolvedValue(undefined);
  const createMainWindow = vi.fn().mockResolvedValue(window);
  const installInvokeHandler = vi.fn();
  const loadMainWindow = vi.fn().mockResolvedValue(undefined);
  mocks.app.whenReady.mockResolvedValue(undefined);

  const { installMainLifecycle } = await import('./mainLifecycle.js');
  installMainLifecycle({
    activateMainWindow,
    createMainWindow,
    installInvokeHandler,
    loadMainWindow,
    runtimeMode: { allowParallelInstance: true } as never
  });
  await vi.waitFor(() => {
    expect(mocks.appendBootEvent).toHaveBeenCalledWith('main_window_ready');
  });

  expect(installInvokeHandler).toHaveBeenCalledTimes(1);
  expect(mocks.initializeDatabase).toHaveBeenCalledTimes(1);
  expect(createMainWindow).toHaveBeenCalledWith(null);
  expect(createMainWindow).toHaveBeenCalledTimes(1);
  expect(loadMainWindow).toHaveBeenCalledWith(window);
  expect(mocks.registerAttachmentProtocol).toHaveBeenCalledTimes(1);
  expect(firstInvocationOrder(mocks.registerAttachmentProtocol)).toBeLessThan(firstInvocationOrder(loadMainWindow));
  expect(firstInvocationOrder(loadMainWindow)).toBeLessThan(firstInvocationOrder(activateMainWindow));
  expect(mocks.presentInitialRendererWindow).toHaveBeenCalledWith(window, { show: true });
  expect(activateMainWindow).toHaveBeenCalledWith(window);
  expect(firstInvocationOrder(activateMainWindow)).toBeLessThan(firstInvocationOrder(mocks.prepareGlobalClipToInboxWindows));
});

it('keeps the startup window alive and loads the startup error surface when database startup fails', async () => {
  let visible = false;
  const window = {
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => visible),
    show: vi.fn(() => {
      visible = true;
    })
  };
  const activateMainWindow = vi.fn().mockResolvedValue(undefined);
  const createMainWindow = vi.fn().mockResolvedValue(window);
  const installInvokeHandler = vi.fn();
  const loadMainWindow = vi.fn().mockResolvedValue(undefined);
  mocks.initializeDatabase.mockImplementation(() => {
    throw new Error('migration exploded');
  });
  mocks.app.whenReady.mockResolvedValue(undefined);

  const { installMainLifecycle } = await import('./mainLifecycle.js');
  installMainLifecycle({
    activateMainWindow,
    createMainWindow,
    installInvokeHandler,
    loadMainWindow,
    runtimeMode: { allowParallelInstance: true } as never
  });
  await vi.waitFor(() => {
    expect(createMainWindow).toHaveBeenCalled();
  });

  expect(installInvokeHandler).toHaveBeenCalledTimes(1);
  expect(createMainWindow).toHaveBeenCalledWith(null);
  expect(mocks.registerAttachmentProtocol).toHaveBeenCalledTimes(1);
  expect(firstInvocationOrder(mocks.registerAttachmentProtocol)).toBeLessThan(firstInvocationOrder(loadMainWindow));
  expect(loadMainWindow).toHaveBeenNthCalledWith(1, window);
  expect(loadMainWindow).toHaveBeenNthCalledWith(2, window, {
    errorSummary: 'migration exploded',
    kind: 'startup-error',
    logPath: '/logs',
    moduleLabel: 'Database migration'
  });
  expect(window.show).toHaveBeenCalledTimes(1);
  expect(activateMainWindow).not.toHaveBeenCalled();
  expect(mocks.appendMainProcessDiagnosticLog).toHaveBeenCalledWith(
    'startup_runtime_services_failed',
    expect.objectContaining({ error: expect.any(Error) })
  );
});

it('shows a startup error surface when the workspace renderer cannot load', async () => {
  let visible = false;
  const window = {
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => visible),
    show: vi.fn(() => {
      visible = true;
    })
  };
  const activateMainWindow = vi.fn().mockResolvedValue(undefined);
  const createMainWindow = vi.fn().mockResolvedValue(window);
  const installInvokeHandler = vi.fn();
  const loadMainWindow = vi
    .fn()
    .mockRejectedValueOnce(new Error('ERR_CONNECTION_REFUSED'))
    .mockResolvedValueOnce(undefined);
  mocks.app.whenReady.mockResolvedValue(undefined);

  const { installMainLifecycle } = await import('./mainLifecycle.js');
  installMainLifecycle({
    activateMainWindow,
    createMainWindow,
    installInvokeHandler,
    loadMainWindow,
    runtimeMode: { allowParallelInstance: true } as never
  });
  await vi.waitFor(() => {
    expect(loadMainWindow).toHaveBeenCalledTimes(2);
  });

  expect(mocks.registerAttachmentProtocol).toHaveBeenCalledTimes(1);
  expect(firstInvocationOrder(mocks.registerAttachmentProtocol)).toBeLessThan(firstInvocationOrder(loadMainWindow));
  expect(loadMainWindow).toHaveBeenNthCalledWith(1, window);
  expect(loadMainWindow).toHaveBeenNthCalledWith(2, window, {
    errorSummary: 'ERR_CONNECTION_REFUSED',
    kind: 'startup-error',
    logPath: '/logs',
    moduleLabel: 'Workspace shell'
  });
  expect(window.show).toHaveBeenCalledTimes(1);
  expect(activateMainWindow).not.toHaveBeenCalled();
});
