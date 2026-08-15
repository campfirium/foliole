// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendBootEvent: vi.fn().mockResolvedValue(undefined),
  app: {
    getAppPath: vi.fn(() => '/app'),
    getVersion: vi.fn(() => '0.1.0-test'),
    isPackaged: false,
    on: vi.fn(),
    quit: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => true),
    whenReady: vi.fn()
  },
  reconcileDesktopCompanionSyncRuntime: vi.fn().mockResolvedValue(undefined),
  initializeDatabase: vi.fn(),
  installAppMenu: vi.fn(),
  isDesktopCompanionSyncParticipating: vi.fn(() => false),
  focusWindow: vi.fn(),
  presentInitialRendererWindow: vi.fn(),
  wasOpenedAtLogin: vi.fn(() => false),
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
vi.mock('./attachments/attachmentProtocol.js', () => ({ registerAttachmentProtocol: mocks.registerAttachmentProtocol }));
vi.mock('./attachments/extDocImageProtocol.js', () => ({ registerExtDocImageProtocol: mocks.registerExtDocImageProtocol }));
vi.mock('./attachments/remoteImageProtocol.js', () => ({ registerRemoteImageProtocol: mocks.registerRemoteImageProtocol }));
vi.mock('./database/backupRestore.js', () => ({ reconcileAutomaticDatabaseBackups: vi.fn() }));
vi.mock('./database/deviceIdentity.js', () => ({ loadOrCreateDesktopDeviceId: vi.fn(() => 'device-desktop') }));
vi.mock('./database/migrate.js', () => ({ initializeDatabase: mocks.initializeDatabase }));
vi.mock('./database/nodeMutations.js', () => ({ flushAllDirtyNodeSyncVersions: vi.fn() }));
vi.mock('./database/pdfIndexing.js', () => ({ resumePendingPdfAttachmentIndexing: vi.fn() }));
vi.mock('./database/syncGroupIdentityStore.js', () => ({ updateLocalSyncGroupDeviceName: vi.fn() }));
vi.mock('./devRendererReloadIntent.js', () => ({ installDevRendererReloadIntentWatcher: vi.fn(() => null) }));
vi.mock('./devRestartIntent.js', () => ({ installDevRestartIntentWatcher: vi.fn(() => null) }));
vi.mock('./diagnostics/mainProcessDiagnostics.js', () => ({
  appendMainProcessDiagnosticLog: vi.fn()
}));
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
  prepareGlobalClipToInboxWindows: vi.fn(),
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
vi.mock('./loginItemSettings.js', () => ({ wasOpenedAtLogin: mocks.wasOpenedAtLogin }));
vi.mock('./mirror/mirrorSyncScheduler.js', () => ({ flushMirrorSync: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./mirror/rebuildMirrorOutput.js', () => ({ backfillMissingMirrorOutput: vi.fn() }));
vi.mock('./runtimeMainSupport.js', () => ({
  bindEmbeddedLinkPanelContents: vi.fn(),
  bindMainWindowNavigationGuard: vi.fn(),
  focusWindow: mocks.focusWindow,
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
vi.mock('./sync/desktopCompanionSyncParticipation.js', () => ({
  reconcileDesktopCompanionSyncRuntime: mocks.reconcileDesktopCompanionSyncRuntime
}));
vi.mock('./sync/lanWorkspaceSyncServer.js', () => ({
  setLanWorkspaceSyncPairRequestHandler: vi.fn(),
  stopLanWorkspaceSyncServer: vi.fn().mockResolvedValue(undefined)
}));

function firstInvocationOrder(mock: { mock: { invocationCallOrder: number[] } }) {
  const [order] = mock.mock.invocationCallOrder;
  expect(order).toBeDefined();
  return order!;
}

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

afterEach(async () => {
  vi.clearAllMocks();
  mocks.initializeDatabase.mockReset();
  mocks.reconcileDesktopCompanionSyncRuntime.mockReset();
  mocks.reconcileDesktopCompanionSyncRuntime.mockResolvedValue(undefined);
  mocks.isDesktopCompanionSyncParticipating.mockReset();
  mocks.isDesktopCompanionSyncParticipating.mockReturnValue(false);
  mocks.wasOpenedAtLogin.mockReset();
  mocks.wasOpenedAtLogin.mockReturnValue(false);
  const { resetDatabaseReadinessForTests } = await import('./database/databaseReadiness.js');
  resetDatabaseReadinessForTests();
  vi.resetModules();
});

it('starts runtime services before renderer shell loading completes', async () => {
  const window = { isDestroyed: vi.fn(() => false), isVisible: vi.fn(() => false), show: vi.fn() };
  const rendererLoad = createDeferred();
  const activateMainWindow = vi.fn().mockResolvedValue(undefined);
  const createMainWindow = vi.fn().mockResolvedValue(window);
  const loadMainWindow = vi.fn(() => rendererLoad.promise);
  mocks.app.whenReady.mockResolvedValue(undefined);

  const { installMainLifecycle } = await import('./mainLifecycle.js');
  installMainLifecycle({
    activateMainWindow,
    createMainWindow,
    installInvokeHandler: vi.fn(),
    loadMainWindow,
    runtimeMode: { allowParallelInstance: true } as never
  });
  await vi.waitFor(() => expect(mocks.initializeDatabase).toHaveBeenCalledTimes(1));

  expect(activateMainWindow).not.toHaveBeenCalled();
  rendererLoad.resolve();
  await vi.waitFor(() => expect(activateMainWindow).toHaveBeenCalledWith(window));
});

it('reuses the startup main window when a second instance arrives during initial creation', async () => {
  const window = { isDestroyed: vi.fn(() => false), isVisible: vi.fn(() => false), show: vi.fn() };
  const windowCreation = createDeferred<typeof window>();
  const activateMainWindow = vi.fn().mockResolvedValue(undefined);
  const createMainWindow = vi.fn(() => windowCreation.promise as never);
  mocks.wasOpenedAtLogin.mockReturnValue(true);
  mocks.app.whenReady.mockResolvedValue(undefined);

  const { installMainLifecycle } = await import('./mainLifecycle.js');
  installMainLifecycle({
    activateMainWindow,
    createMainWindow,
    installInvokeHandler: vi.fn(),
    loadMainWindow: vi.fn().mockResolvedValue(undefined),
    runtimeMode: { allowParallelInstance: false } as never
  });
  await vi.waitFor(() => expect(createMainWindow).toHaveBeenCalledTimes(1));

  const secondInstanceHandler = mocks.app.on.mock.calls.find(([event]) => event === 'second-instance')?.[1];
  expect(secondInstanceHandler).toBeTypeOf('function');
  secondInstanceHandler?.({}, ['Foliole Internal.exe']);
  expect(createMainWindow).toHaveBeenCalledTimes(1);

  windowCreation.resolve(window);
  await vi.waitFor(() => expect(activateMainWindow).toHaveBeenCalledWith(window));
  expect(createMainWindow).toHaveBeenCalledTimes(1);
  expect(mocks.presentInitialRendererWindow).toHaveBeenCalledWith(window, { show: false });
  expect(window.show).toHaveBeenCalled();
  expect(mocks.focusWindow).toHaveBeenCalledWith(window);
});

it('prioritizes the workspace shell error when renderer and database startup both fail', async () => {
  const window = { isDestroyed: vi.fn(() => false), isVisible: vi.fn(() => false), show: vi.fn() };
  const loadMainWindow = vi.fn()
    .mockRejectedValueOnce(new Error('renderer exploded'))
    .mockResolvedValueOnce(undefined);
  mocks.initializeDatabase.mockImplementation(() => {
    throw new Error('database exploded');
  });
  mocks.app.whenReady.mockResolvedValue(undefined);

  const { installMainLifecycle } = await import('./mainLifecycle.js');
  installMainLifecycle({
    activateMainWindow: vi.fn().mockResolvedValue(undefined),
    createMainWindow: vi.fn().mockResolvedValue(window),
    installInvokeHandler: vi.fn(),
    loadMainWindow,
    runtimeMode: { allowParallelInstance: true } as never
  });
  await vi.waitFor(() => expect(loadMainWindow).toHaveBeenCalledTimes(2));

  expect(loadMainWindow).toHaveBeenNthCalledWith(2, window, {
    errorSummary: 'renderer exploded',
    kind: 'startup-error',
    logPath: '/logs',
    moduleLabel: 'Workspace shell'
  });
});

it('fails database readiness when startup stops before database initialization starts', async () => {
  const window = { isDestroyed: vi.fn(() => false), isVisible: vi.fn(() => false), show: vi.fn() };
  const loadMainWindow = vi.fn().mockResolvedValue(undefined);
  mocks.registerAttachmentProtocol.mockImplementationOnce(() => {
    throw new Error('protocol exploded');
  });
  mocks.app.whenReady.mockResolvedValue(undefined);

  const { installMainLifecycle } = await import('./mainLifecycle.js');
  installMainLifecycle({
    activateMainWindow: vi.fn().mockResolvedValue(undefined),
    createMainWindow: vi.fn().mockResolvedValue(window),
    installInvokeHandler: vi.fn(),
    loadMainWindow,
    runtimeMode: { allowParallelInstance: true } as never
  });
  await vi.waitFor(() => expect(loadMainWindow).toHaveBeenCalledTimes(1));

  const { waitForDatabaseReady } = await import('./database/databaseReadiness.js');
  await expect(waitForDatabaseReady()).rejects.toThrow('protocol exploded');
});


it('starts companion sync after database startup before activating the renderer', async () => {
  const window = { isDestroyed: vi.fn(() => false), isVisible: vi.fn(() => false), show: vi.fn() };
  const activateMainWindow = vi.fn().mockResolvedValue(undefined);
  mocks.isDesktopCompanionSyncParticipating.mockReturnValue(true);
  mocks.app.whenReady.mockResolvedValue(undefined);

  const { installMainLifecycle } = await import('./mainLifecycle.js');
  installMainLifecycle({
    activateMainWindow,
    createMainWindow: vi.fn().mockResolvedValue(window),
    installInvokeHandler: vi.fn(),
    loadMainWindow: vi.fn().mockResolvedValue(undefined),
    runtimeMode: { allowParallelInstance: true } as never
  });
  await vi.waitFor(() => expect(activateMainWindow).toHaveBeenCalledWith(window));

  expect(firstInvocationOrder(mocks.initializeDatabase)).toBeLessThan(
    firstInvocationOrder(mocks.reconcileDesktopCompanionSyncRuntime)
  );
  expect(firstInvocationOrder(mocks.reconcileDesktopCompanionSyncRuntime)).toBeLessThan(
    firstInvocationOrder(activateMainWindow)
  );
});
