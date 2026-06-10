import { BrowserWindow, ipcMain } from 'electron';

import { GLOBAL_CAPTURE_TOAST_OPEN_CHANNEL } from './globalCaptureChannels.js';
import { waitForRendererAppReady } from './ipc/boot.js';
import { IPC_GLOBAL_CAPTURE_NAVIGATE_CHANNEL } from './ipc/contracts.js';

let hasInstalledToastOpenHandler = false;
const RENDERER_APP_READY_WAIT_MS = 300;

declare global {
  var __folioleGlobalCaptureToastOpenForTests: { nodeId: string; senderId: number } | undefined;
}

function delay(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

async function sendGlobalCaptureNavigation(window: BrowserWindow, nodeId: string) {
  await Promise.race([
    waitForRendererAppReady(),
    delay(RENDERER_APP_READY_WAIT_MS)
  ]);
  if (!window.isDestroyed()) {
    window.webContents.send(IPC_GLOBAL_CAPTURE_NAVIGATE_CHANNEL, { nodeId });
  }
}

function restoreWindowPresentation(window: BrowserWindow, shouldRestoreFullScreen: boolean, shouldRestoreMaximized: boolean) {
  if (window.isDestroyed()) {
    return;
  }
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  if (shouldRestoreFullScreen && !window.isFullScreen()) {
    window.setFullScreen(true);
  } else if (shouldRestoreMaximized && !window.isMaximized()) {
    window.maximize();
  }
  window.focus();
}

function activateWindowPreservingPresentation(window: BrowserWindow) {
  const wasFullScreen = window.isFullScreen();
  const wasMaximized = window.isMaximized();
  restoreWindowPresentation(window, wasFullScreen, wasMaximized);
  globalThis.setTimeout(() => {
    restoreWindowPresentation(window, wasFullScreen, wasMaximized);
  }, 0);
}

export function openGlobalCaptureTarget(nodeId: string, senderId: number) {
  if (process.env.FOLIOLE_ALLOW_PARALLEL_INSTANCE === '1') {
    globalThis.__folioleGlobalCaptureToastOpenForTests = { nodeId, senderId };
  }
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.id === senderId) {
      continue;
    }
    activateWindowPreservingPresentation(window);
    void sendGlobalCaptureNavigation(window, nodeId);
  }
}

export function installGlobalCaptureToastOpenHandler() {
  if (hasInstalledToastOpenHandler) {
    return;
  }
  hasInstalledToastOpenHandler = true;
  ipcMain.on(GLOBAL_CAPTURE_TOAST_OPEN_CHANNEL, (event, payload) => {
    const nodeId = typeof payload?.nodeId === 'string' ? payload.nodeId.trim() : '';
    if (nodeId) {
      openGlobalCaptureTarget(nodeId, event.sender.id);
    }
  });
}
