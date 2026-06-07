import path from 'node:path';

import { app, type BrowserWindowConstructorOptions, type Session, type WebContents, type WebPreferences } from 'electron';

import { logMainProcessException } from './diagnostics/mainProcessDiagnostics.js';
import { LINK_PANEL_WEBVIEW_PARTITION } from './linkPanelBrowsingData.js';
import {
  loadRenderer,
  logActiveRuntimeDiagnostics,
  type StartupRendererView
} from './rendererLoader.js';
import type { RuntimeDiagnosticsSnapshot } from './runtimeIdentity.js';
import { logWindowStateLifecycleEvent, logWindowStateRestoreDecision } from './windowStateDiagnostics.js';

const guardedEmbeddedLinkPanelSessions = new WeakSet<Session>();

export function resolveMainWindowIconPath(preloadPath: string) {
  return path.resolve(path.dirname(preloadPath), '..', 'build', 'icon.png');
}

export function createMainWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    backgroundColor: '#ffffff',
    autoHideMenuBar: false,
    icon: resolveMainWindowIconPath(preloadPath),
    show: false,
    webPreferences: {
      backgroundThrottling: false,
      devTools: !app.isPackaged,
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
    logMainProcessException('main_uncaught_exception', error);
  });
  process.on('unhandledRejection', (reason) => {
    logMainProcessException('main_unhandled_rejection', reason);
  });
}

export function bindEmbeddedLinkPanelContents(contents: WebContents) {
  if (contents.getType() !== 'webview') {
    return;
  }
  installEmbeddedLinkPanelSessionGuards(contents.session);
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedEmbeddedLinkPanelUrl(url)) {
      void contents.loadURL(url);
    }
    return { action: 'deny' };
  });
}

export function bindMainWindowNavigationGuard(window: import('electron').BrowserWindow) {
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

export function bindMainWindowWebviewAttachGuard(window: import('electron').BrowserWindow) {
  window.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    if (!isAllowedLinkPanelAttachParams(params)) {
      event.preventDefault();
      return;
    }
    normalizeLinkPanelWebviewPreferences(webPreferences);
  });
}

function installEmbeddedLinkPanelSessionGuards(session: Session | undefined) {
  if (!session || guardedEmbeddedLinkPanelSessions.has(session)) {
    return;
  }
  guardedEmbeddedLinkPanelSessions.add(session);
  session.setPermissionCheckHandler(() => false);
  session.setPermissionRequestHandler((webContents, _permission, callback) => {
    if (webContents?.getType() === 'webview') {
      callback(false);
      return;
    }
    callback(false);
  });
  session.on('will-download', (event, _item, webContents) => {
    if (webContents?.getType() === 'webview') {
      event.preventDefault();
    }
  });
}

function isAllowedLinkPanelAttachParams(params: Record<string, string | undefined>) {
  return params.partition === LINK_PANEL_WEBVIEW_PARTITION && isAllowedEmbeddedLinkPanelUrl(params.src ?? '');
}

function normalizeLinkPanelWebviewPreferences(webPreferences: WebPreferences) {
  delete webPreferences.preload;
  webPreferences.nodeIntegration = false;
  webPreferences.contextIsolation = true;
  webPreferences.sandbox = true;
}

export function isAllowedEmbeddedLinkPanelUrl(url: string) {
  if (!url.trim()) {
    return false;
  }
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function loadMainWindowRenderer(args: {
  runtimeDiagnostics: RuntimeDiagnosticsSnapshot;
  runtimeDir: string;
  startupView?: StartupRendererView | null;
  window: import('electron').BrowserWindow;
}) {
  await loadRenderer(args.window, args.runtimeDir, args.startupView);
  logActiveRuntimeDiagnostics(args.window, args.runtimeDir, args.runtimeDiagnostics);
}

export async function activateMainWindowRenderer(window: import('electron').BrowserWindow) {
  void window;
}

export { logWindowStateLifecycleEvent, logWindowStateRestoreDecision };
