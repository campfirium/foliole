import type { BrowserWindow } from 'electron';

import { IPC_COMPANION_PAIRING_REQUESTS_CHANGED_CHANNEL } from './ipc/contracts.js';
import { getMainWindow, setMainWindow } from './mainWindowRegistry.js';
import type { StartupRendererView } from './rendererLoader.js';
import { focusWindow } from './runtimeMainSupport.js';
import { ensureLanWorkspaceSyncServer, setLanWorkspaceSyncPairRequestHandler } from './sync/lanWorkspaceSyncServer.js';
import { applyStartupWindowPresentation, presentInitialRendererWindow } from './windowRuntimeDiagnostics.js';

export interface MainWindowLifecycleRuntime {
  activateMainWindow: (window: BrowserWindow) => Promise<void>;
  createMainWindow: () => Promise<BrowserWindow>;
  loadMainWindow: (window: BrowserWindow, startupView?: StartupRendererView | null) => Promise<void>;
}

export async function openOrCreateMainWindow(
  args: MainWindowLifecycleRuntime,
  onWindowReady: (window: BrowserWindow) => void
) {
  const existingWindow = getMainWindow();
  if (existingWindow) {
    if (!existingWindow.isVisible()) {
      applyStartupWindowPresentation(existingWindow);
      existingWindow.show();
    }
    focusWindow(existingWindow);
    onWindowReady(existingWindow);
    return existingWindow;
  }
  const window = await args.createMainWindow();
  setMainWindow(window);
  await args.loadMainWindow(window);
  await presentInitialRendererWindow(window);
  await args.activateMainWindow(window);
  onWindowReady(window);
  return window;
}

export function installPairingFocusHandler(openMainWindow: () => Promise<BrowserWindow | null>) {
  setLanWorkspaceSyncPairRequestHandler(() => {
    void openMainWindow().then((window) => {
      window?.webContents.send(IPC_COMPANION_PAIRING_REQUESTS_CHANGED_CHANNEL);
    });
  });
}

export async function startCompanionSyncIfEnabled(args: {
  appVersion: string;
  isEnabled: () => boolean;
  peerId: string;
}) {
  if (!args.isEnabled()) {
    return;
  }
  await ensureLanWorkspaceSyncServer({ appVersion: args.appVersion, peerId: args.peerId });
}
