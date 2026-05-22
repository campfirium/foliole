// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendBootEvent: vi.fn(),
  registerAttachmentProtocol: vi.fn(),
  registerRemoteImageProtocol: vi.fn(),
  startDevScreenshotServer: vi.fn(),
  startFollowupTasks: vi.fn(),
  waitForRendererAppReady: vi.fn()
}));

vi.mock('./attachments/attachmentProtocol.js', () => ({ registerAttachmentProtocol: mocks.registerAttachmentProtocol }));
vi.mock('./attachments/remoteImagePipeline.js', () => ({ configureRemoteImagePipelineCacheRoot: vi.fn() }));
vi.mock('./attachments/remoteImageProtocol.js', () => ({ registerRemoteImageProtocol: mocks.registerRemoteImageProtocol }));
vi.mock('./devScreenshotServer.js', () => ({ startDevScreenshotServer: mocks.startDevScreenshotServer }));
vi.mock('./ipc/boot.js', () => ({
  appendBootEvent: mocks.appendBootEvent,
  waitForRendererAppReady: mocks.waitForRendererAppReady
}));
vi.mock('./ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_cache_dir: 'cache' }) }));
vi.mock('./mainFollowupTasks.js', () => ({ startFollowupTasks: mocks.startFollowupTasks }));
vi.mock('./windowRuntimeDiagnostics.js', () => ({ presentInitialRendererWindow: vi.fn() }));

import { startInitialMainWindow } from './mainStartup.js';

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function createStartupArgs(overrides: Partial<Parameters<typeof startInitialMainWindow>[1]> = {}) {
  return {
    failDatabaseStartup: vi.fn(),
    initializeRuntimeServices: vi.fn().mockResolvedValue(undefined),
    installPairingFocusHandler: vi.fn(),
    loadStartupErrorSurface: vi.fn().mockResolvedValue(undefined),
    mainWindow: {} as Parameters<typeof startInitialMainWindow>[1]['mainWindow'],
    startCompanionSyncIfEnabled: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

const mainWindowArgs = {
  activateMainWindow: vi.fn().mockResolvedValue(undefined),
  loadMainWindow: vi.fn().mockResolvedValue(undefined)
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.appendBootEvent.mockResolvedValue(undefined);
  mocks.waitForRendererAppReady.mockResolvedValue(undefined);
  mainWindowArgs.activateMainWindow.mockResolvedValue(undefined);
  mainWindowArgs.loadMainWindow.mockResolvedValue(undefined);
});

it('waits for renderer app_ready before starting desktop followup tasks', async () => {
  const appReady = createDeferred();
  mocks.waitForRendererAppReady.mockReturnValue(appReady.promise);

  const startup = createStartupArgs();
  const startupPromise = startInitialMainWindow(mainWindowArgs, startup);

  await vi.waitFor(() => expect(mocks.appendBootEvent).toHaveBeenCalledWith('main_window_ready'));
  expect(mocks.startFollowupTasks).not.toHaveBeenCalled();

  appReady.resolve();
  await startupPromise;

  expect(mocks.waitForRendererAppReady).toHaveBeenCalledTimes(1);
  expect(mocks.startFollowupTasks).toHaveBeenCalledTimes(1);
});

it('starts desktop followup tasks when app_ready was already latched', async () => {
  const startup = createStartupArgs();

  await startInitialMainWindow(mainWindowArgs, startup);

  expect(mocks.waitForRendererAppReady).toHaveBeenCalledTimes(1);
  expect(mocks.startFollowupTasks).toHaveBeenCalledTimes(1);
});

it('does not arm the followup gate when startup falls back to the error surface', async () => {
  const startup = createStartupArgs({
    initializeRuntimeServices: vi.fn().mockRejectedValue(new Error('migration failed'))
  });

  await startInitialMainWindow(mainWindowArgs, startup);

  expect(startup.loadStartupErrorSurface).toHaveBeenCalledWith({
    error: expect.any(Error),
    moduleLabel: 'Database migration',
    window: startup.mainWindow
  });
  expect(mocks.waitForRendererAppReady).not.toHaveBeenCalled();
  expect(mocks.startFollowupTasks).not.toHaveBeenCalled();
});
