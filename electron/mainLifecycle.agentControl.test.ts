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
  ensureAgentControlApiServer: vi.fn(),
  initializeDatabase: vi.fn(),
  presentInitialRendererWindow: vi.fn(),
  resolveAppPaths: vi.fn(() => ({ app_cache_dir: '/cache', app_log_dir: '/logs' }))
}));

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: vi.fn(() => []) }, app: mocks.app }));
vi.mock('./agentControl/agentControlServer.js', () => ({
  ensureAgentControlApiServer: mocks.ensureAgentControlApiServer,
  stopAgentControlApiServer: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('./appVersion.js', () => ({ resolveFolioleAppVersion: vi.fn(() => '0.1.0-test') }));
vi.mock('./attachments/attachmentProtocol.js', () => ({ registerAttachmentProtocol: vi.fn() }));
vi.mock('./attachments/extDocImageProtocol.js', () => ({ registerExtDocImageProtocol: vi.fn() }));
vi.mock('./attachments/remoteImageProtocol.js', () => ({ registerRemoteImageProtocol: vi.fn() }));
vi.mock('./backgroundPresence.js', () => ({ installBackgroundTray: vi.fn(), markAppQuittingForBackgroundPresence: vi.fn() }));
vi.mock('./database/backupRestore.js', () => ({ reconcileAutomaticDatabaseBackups: vi.fn() }));
vi.mock('./database/databaseReadiness.js', () => ({ beginDatabaseStartup: vi.fn(), markDatabaseReady: vi.fn(), markDatabaseStartupFailed: vi.fn() }));
vi.mock('./database/deviceIdentity.js', () => ({ loadOrCreateDesktopDeviceId: vi.fn(() => 'device-desktop') }));
vi.mock('./database/migrate.js', () => ({ initializeDatabase: mocks.initializeDatabase }));
vi.mock('./database/nodeMutations.js', () => ({ flushAllDirtyNodeSyncVersions: vi.fn() }));
vi.mock('./database/pdfIndexing.js', () => ({ resumePendingPdfAttachmentIndexing: vi.fn() }));
vi.mock('./database/searchIndexInvalidationCoalescer.js', () => ({ flushCoalescedWorkspaceSearchInvalidations: vi.fn() }));
vi.mock('./database/searchIndexInvalidationScheduler.js', () => ({ stopSearchIndexInvalidationScheduler: vi.fn() }));
vi.mock('./devRendererReloadIntent.js', () => ({ installDevRendererReloadIntentWatcher: vi.fn(() => null) }));
vi.mock('./devRestartIntent.js', () => ({ installDevRestartIntentWatcher: vi.fn(() => null) }));
vi.mock('./devScreenshotServer.js', () => ({ stopDevScreenshotServer: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./diagnostics/mainProcessDiagnostics.js', () => ({ appendMainProcessDiagnosticLog: mocks.appendMainProcessDiagnosticLog }));
vi.mock('./externalDocumentFileOpen.js', () => ({ installExternalDocumentFileOpenLifecycle: vi.fn(() => ({ enqueueFromArgv: vi.fn(), setReadyWindow: vi.fn() })) }));
vi.mock('./externalSearchBackgroundRefreshRuntime.js', () => ({ notifyExternalSearchSecondInstance: vi.fn(), notifyExternalSearchUserActivity: vi.fn(), stopExternalSearchBackgroundRefresh: vi.fn() }));
vi.mock('./globalClipToastNavigation.js', () => ({ installGlobalCaptureToastOpenHandler: vi.fn() }));
vi.mock('./globalClipShortcut.js', () => ({ installGlobalClipShortcut: vi.fn() }));
vi.mock('./globalClipToInbox.js', () => ({ prepareGlobalClipToInboxWindows: vi.fn(), runGlobalClipToInbox: vi.fn() }));
vi.mock('./import/keepImportMonitor.js', () => ({ stopKeepImportMonitor: vi.fn() }));
vi.mock('./import/managedInboxMonitor.js', () => ({ stopManagedInboxMonitor: vi.fn() }));
vi.mock('./ipc/boot.js', () => ({ appendBootEvent: mocks.appendBootEvent }));
vi.mock('./ipc/menu.js', () => ({ installAppMenu: vi.fn() }));
vi.mock('./mainStartup.js', () => ({ startInitialMainWindow: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./mainWindowLifecycle.js', () => ({ installPairingFocusHandler: vi.fn(), openOrCreateMainWindow: vi.fn(), startCompanionSyncIfEnabled: vi.fn() }));
vi.mock('./mainWindowRegistry.js', () => ({ getMainWindow: vi.fn(), setMainWindow: vi.fn() }));
vi.mock('./mirror/mirrorSyncScheduler.js', () => ({ flushMirrorSync: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./runtimeMainSupport.js', () => ({ bindEmbeddedLinkPanelContents: vi.fn(), installMainRuntimeDiagnostics: vi.fn() }));
vi.mock('./startupErrorSurface.js', () => ({ loadStartupErrorSurface: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./sync/desktopCompanionSyncPreference.js', () => ({ isDesktopCompanionSyncEnabled: vi.fn(() => false) }));
vi.mock('./sync/lanWorkspaceSyncServer.js', () => ({ stopLanWorkspaceSyncServer: vi.fn().mockResolvedValue(undefined) }));

function mainWindow() {
  return { isDestroyed: vi.fn(() => false), isVisible: vi.fn(() => true), show: vi.fn() };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

it('logs non-sensitive Agent Control failed status during startup', async () => {
  mocks.ensureAgentControlApiServer.mockResolvedValue({
    endpoint: null,
    last_error: 'EADDRINUSE: address already in use',
    port: null,
    state: 'failed'
  });
  mocks.app.whenReady.mockResolvedValue(undefined);

  const { installMainLifecycle } = await import('./mainLifecycle.js');
  installMainLifecycle({
    activateMainWindow: vi.fn().mockResolvedValue(undefined),
    createMainWindow: vi.fn().mockResolvedValue(mainWindow()),
    installInvokeHandler: vi.fn(),
    loadMainWindow: vi.fn().mockResolvedValue(undefined),
    runtimeMode: { allowParallelInstance: true } as never
  });

  await vi.waitFor(() => {
    expect(mocks.appendMainProcessDiagnosticLog).toHaveBeenCalledWith('agent_control_start_failed', {
      message: 'EADDRINUSE: address already in use',
      state: 'failed'
    });
  });
});
