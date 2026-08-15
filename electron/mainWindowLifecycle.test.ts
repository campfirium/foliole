// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyStartupWindowPresentation: vi.fn(),
  focusWindow: vi.fn(),
  pairingHandler: null as (() => void) | null,
  presentInitialRendererWindow: vi.fn().mockResolvedValue(undefined),
  reconcileDesktopCompanionSyncRuntime: vi.fn().mockResolvedValue(undefined),
  setLanWorkspaceSyncPairRequestHandler: vi.fn((handler: () => void) => {
    mocks.pairingHandler = handler;
  }),
  updateLocalSyncGroupDeviceName: vi.fn()
}));

vi.mock('./database/syncGroupIdentityStore.js', () => ({
  updateLocalSyncGroupDeviceName: mocks.updateLocalSyncGroupDeviceName
}));
vi.mock('./sync/companionLanPayloads.js', () => ({ resolveDesktopDeviceName: () => 'Maci' }));
vi.mock('./sync/desktopCompanionSyncParticipation.js', () => ({
  reconcileDesktopCompanionSyncRuntime: mocks.reconcileDesktopCompanionSyncRuntime
}));
vi.mock('./runtimeMainSupport.js', () => ({ focusWindow: mocks.focusWindow }));
vi.mock('./windowRuntimeDiagnostics.js', () => ({
  applyStartupWindowPresentation: mocks.applyStartupWindowPresentation,
  presentInitialRendererWindow: mocks.presentInitialRendererWindow
}));
vi.mock('./sync/lanWorkspaceSyncServer.js', () => ({
  setLanWorkspaceSyncPairRequestHandler: mocks.setLanWorkspaceSyncPairRequestHandler
}));

function createWindow(visible = false) {
  return {
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => visible),
    once: vi.fn(),
    show: vi.fn(),
    webContents: {
      send: vi.fn()
    }
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.pairingHandler = null;
  const { clearMainWindowForTests } = await import('./mainWindowRegistry.js');
  clearMainWindowForTests();
});

it('restores a hidden main window without creating another one', async () => {
  const window = createWindow(false);
  const { setMainWindow } = await import('./mainWindowRegistry.js');
  const { openOrCreateMainWindow } = await import('./mainWindowLifecycle.js');
  setMainWindow(window as never);
  const createMainWindow = vi.fn();
  const onWindowReady = vi.fn();

  await expect(openOrCreateMainWindow({
    activateMainWindow: vi.fn(),
    createMainWindow,
    loadMainWindow: vi.fn()
  }, onWindowReady)).resolves.toBe(window);

  expect(window.show).toHaveBeenCalledTimes(1);
  expect(mocks.applyStartupWindowPresentation).toHaveBeenCalledWith(window);
  expect(mocks.focusWindow).toHaveBeenCalledWith(window);
  expect(createMainWindow).not.toHaveBeenCalled();
  expect(onWindowReady).toHaveBeenCalledWith(window);
});

it('rebuilds the main window when the registry has no usable window', async () => {
  const window = createWindow(true);
  const createMainWindow = vi.fn().mockResolvedValue(window);
  const loadMainWindow = vi.fn().mockResolvedValue(undefined);
  const activateMainWindow = vi.fn().mockResolvedValue(undefined);
  const onWindowReady = vi.fn();
  const { openOrCreateMainWindow } = await import('./mainWindowLifecycle.js');

  await expect(openOrCreateMainWindow({
    activateMainWindow,
    createMainWindow,
    loadMainWindow
  }, onWindowReady)).resolves.toBe(window);

  expect(loadMainWindow).toHaveBeenCalledWith(window);
  expect(mocks.presentInitialRendererWindow).toHaveBeenCalledWith(window);
  expect(activateMainWindow).toHaveBeenCalledWith(window);
  expect(onWindowReady).toHaveBeenCalledWith(window);
});

it('routes pairing requests through the main window opener', async () => {
  const window = createWindow(true);
  const { installPairingFocusHandler } = await import('./mainWindowLifecycle.js');
  installPairingFocusHandler(vi.fn().mockResolvedValue(window));

  mocks.pairingHandler?.();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(window.webContents.send).toHaveBeenCalledWith('foliole:companion-pairing-requests-changed');
});

it('refreshes the persisted local Device name even while Sync is paused', async () => {
  const { startCompanionSyncIfEnabled } = await import('./mainWindowLifecycle.js');

  await startCompanionSyncIfEnabled({ appVersion: '0.7.5', isEnabled: () => false, peerId: 'desktop-a' });

  expect(mocks.updateLocalSyncGroupDeviceName).toHaveBeenCalledWith('Maci');
});

it('reconciles enabled Sync through the workgroup security boundary', async () => {
  const { startCompanionSyncIfEnabled } = await import('./mainWindowLifecycle.js');

  await startCompanionSyncIfEnabled({ appVersion: '0.7.5', isEnabled: () => true, peerId: 'desktop-a' });

  expect(mocks.reconcileDesktopCompanionSyncRuntime).toHaveBeenCalledWith({
    appVersion: '0.7.5', peerId: 'desktop-a'
  });
});
