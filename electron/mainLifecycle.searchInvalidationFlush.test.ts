// @vitest-environment node
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  app: {
    getVersion: vi.fn(() => '0.1.0-test'),
    on: vi.fn(),
    quit: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => true),
    whenReady: vi.fn(() => new Promise(() => undefined))
  },
  flushCoalescedWorkspaceSearchInvalidations: vi.fn()
}));

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  app: mocks.app
}));
vi.mock('./database/searchIndexInvalidationCoalescer.js', () => ({
  flushCoalescedWorkspaceSearchInvalidations: mocks.flushCoalescedWorkspaceSearchInvalidations
}));
vi.mock('./database/nodeMutations.js', () => ({ flushAllDirtyNodeSyncVersions: vi.fn() }));
vi.mock('./database/searchIndexInvalidationScheduler.js', () => ({ stopSearchIndexInvalidationScheduler: vi.fn() }));
vi.mock('./devRendererReloadIntent.js', () => ({ installDevRendererReloadIntentWatcher: vi.fn(() => null) }));
vi.mock('./devRestartIntent.js', () => ({ installDevRestartIntentWatcher: vi.fn(() => null) }));
vi.mock('./diagnostics/mainProcessDiagnostics.js', () => ({ appendMainProcessDiagnosticLog: vi.fn() }));
vi.mock('./externalDocumentFileOpen.js', () => ({
  installExternalDocumentFileOpenLifecycle: vi.fn(() => ({ enqueueFromArgv: vi.fn(), setReadyWindow: vi.fn() }))
}));
vi.mock('./externalSearchBackgroundRefreshRuntime.js', () => ({
  notifyExternalSearchSecondInstance: vi.fn(),
  notifyExternalSearchUserActivity: vi.fn(),
  stopExternalSearchBackgroundRefresh: vi.fn()
}));
vi.mock('./backgroundPresence.js', () => ({
  installBackgroundTray: vi.fn(),
  markAppQuittingForBackgroundPresence: vi.fn()
}));
vi.mock('./globalClipToastNavigation.js', () => ({ installGlobalCaptureToastOpenHandler: vi.fn() }));
vi.mock('./globalClipShortcut.js', () => ({
  installGlobalClipShortcut: vi.fn(),
  refreshGlobalClipShortcutFromSettings: vi.fn()
}));
vi.mock('./globalClipToInbox.js', () => ({ prepareGlobalClipToInboxWindows: vi.fn(), runGlobalClipToInbox: vi.fn() }));
vi.mock('./initialLibrarySetup.js', () => ({
  initializeRuntimeServicesAfterLibrarySetup: vi.fn(async (_preparation: unknown, initialize: () => Promise<void>, after?: () => void) => {
    await initialize();
    after?.();
  }),
  prepareInitialLibrarySetup: vi.fn(() => null),
  quitIfInitialLibrarySetupIsAbandoned: vi.fn()
}));
vi.mock('./import/keepImportMonitor.js', () => ({ stopKeepImportMonitor: vi.fn() }));
vi.mock('./import/managedInboxMonitor.js', () => ({ stopManagedInboxMonitor: vi.fn() }));
vi.mock('./mainStartup.js', () => ({ startInitialMainWindow: vi.fn() }));
vi.mock('./mainWindowLifecycle.js', () => ({
  installPairingFocusHandler: vi.fn(),
  openOrCreateMainWindow: vi.fn(),
  startCompanionSyncIfEnabled: vi.fn()
}));
vi.mock('./mainWindowRegistry.js', () => ({ getMainWindow: vi.fn(), setMainWindow: vi.fn() }));
vi.mock('./mirror/mirrorSyncScheduler.js', () => ({ flushMirrorSync: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./devScreenshotServer.js', () => ({ stopDevScreenshotServer: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./sync/lanWorkspaceSyncServer.js', () => ({
  setLanWorkspaceSyncPairRequestHandler: vi.fn(),
  stopLanWorkspaceSyncServer: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('./runtimeMainSupport.js', () => ({
  bindEmbeddedLinkPanelContents: vi.fn(),
  focusWindow: vi.fn(),
  installMainRuntimeDiagnostics: vi.fn()
}));
vi.mock('./sync/desktopCompanionSyncPreference.js', () => ({ isDesktopCompanionSyncEnabled: vi.fn(() => false) }));
vi.mock('./database/databaseReadiness.js', () => ({
  beginDatabaseStartup: vi.fn(),
  markDatabaseReady: vi.fn(),
  markDatabaseStartupFailed: vi.fn()
}));
vi.mock('./database/deviceIdentity.js', () => ({ loadOrCreateDesktopDeviceId: vi.fn(() => 'desktop-test') }));
vi.mock('./database/migrate.js', () => ({ initializeDatabase: vi.fn() }));
vi.mock('./ipc/boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./ipc/menu.js', () => ({ installAppMenu: vi.fn() }));
vi.mock('./ipc/paths.js', () => ({ resolveAppPaths: vi.fn(() => ({ app_log_dir: '/logs' })) }));

it('flushes coalesced search invalidations before quitting', async () => {
  const { installMainLifecycle } = await import('./mainLifecycle.js');

  installMainLifecycle({
    activateMainWindow: vi.fn(),
    createMainWindow: vi.fn(),
    installInvokeHandler: vi.fn(),
    loadMainWindow: vi.fn(),
    runtimeMode: { allowParallelInstance: true } as never
  });
  const beforeQuitHandler = mocks.app.on.mock.calls.find((call) => call[0] === 'before-quit')?.[1];

  expect(beforeQuitHandler).toBeDefined();
  beforeQuitHandler?.({ preventDefault: vi.fn() });

  expect(mocks.flushCoalescedWorkspaceSearchInvalidations).toHaveBeenCalledTimes(1);
});
