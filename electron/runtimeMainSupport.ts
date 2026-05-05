import type { BrowserWindowConstructorOptions, WebContents } from 'electron';

import { loadRenderer, logActiveRuntimeDiagnostics } from './rendererLoader.js';
import type { RuntimeDiagnosticsSnapshot } from './runtimeIdentity.js';
import { logWindowStateLifecycleEvent, logWindowStateRestoreDecision } from './windowStateDiagnostics.js';

export function createMainWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    backgroundColor: '#fcfcfc',
    autoHideMenuBar: false,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: true
    }
  };
}

export function focusWindow(window: import('electron').BrowserWindow | undefined) {
  if (!window) {
    return;
  }
  if (window.isMinimized()) {
    window.restore();
  }
  window.focus();
}

export function installMainRuntimeDiagnostics() {
  process.on('uncaughtException', (error) => {
    console.error('[electron-main] uncaughtException', error);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[electron-main] unhandledRejection', reason);
  });
}

export function bindEmbeddedLinkPanelContents(contents: WebContents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (contents.getType() === 'webview' && url.trim()) {
      void contents.loadURL(url);
    }
    return { action: 'deny' };
  });
}

export async function loadMainWindowRenderer(args: {
  runtimeDiagnostics: RuntimeDiagnosticsSnapshot;
  runtimeDir: string;
  window: import('electron').BrowserWindow;
}) {
  await loadRenderer(args.window, args.runtimeDir);
  logActiveRuntimeDiagnostics(args.window, args.runtimeDir, args.runtimeDiagnostics);
}

export { logWindowStateLifecycleEvent, logWindowStateRestoreDecision };
