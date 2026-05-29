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
vi.mock('./import/keepImportMonitor.js', () => ({ stopKeepImportMonitor: vi.fn() }));
vi.mock('./import/managedInboxMonitor.js', () => ({ stopManagedInboxMonitor: vi.fn() }));
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
