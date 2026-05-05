import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  app,
  BrowserWindow,
  ipcMain,
  type BrowserWindow as ElectronBrowserWindow,
  type BrowserWindowConstructorOptions
} from 'electron';

import { initializeDatabase } from './database/migrate.js';
import { installDevRestartIntentWatcher } from './devRestartIntent.js';
import { handleInvokeRequest } from './ipc/commands.js';
import {
  IPC_INVOKE_CHANNEL,
  IPC_WINDOW_CLOSE_CHANNEL,
  IPC_WINDOW_IS_MAXIMIZED_CHANNEL,
  IPC_WINDOW_MINIMIZE_CHANNEL,
  IPC_WINDOW_RESIZED_EVENT_CHANNEL,
  IPC_WINDOW_TOGGLE_MAXIMIZE_CHANNEL,
  type InvokeRequest
} from './ipc/contracts.js';
import { migrateLegacyWebviewStorage } from './ipc/legacyWebviewStorage.js';
import { bindMenuToWindow, installAppMenu } from './ipc/menu.js';
import { loadWindowState } from './ipc/windowState.js';
import {
  collectRuntimeDiagnosticsSnapshot,
  configureRuntimeAppIdentity,
  formatRuntimeDiagnosticsSnapshot,
  resolveRendererTargetUrl
} from './runtimeIdentity.js';
import { resolveRendererIndexPath } from './runtimePaths.js';
import { applyWindowStateToOptions, bindWindowStatePersistence } from './windowStateLifecycle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configuredIdentity = configureRuntimeAppIdentity(app, fs.mkdirSync.bind(fs));
const runtimeDiagnostics = collectRuntimeDiagnosticsSnapshot({
  appName: configuredIdentity.appName,
  existsSync: fs.existsSync,
  runtimeDir: __dirname,
  userDataPath: configuredIdentity.userDataPath
});

console.info('[electron-main] app identity configured', configuredIdentity);
console.info('[electron-main] runtime diagnostics', formatRuntimeDiagnosticsSnapshot(runtimeDiagnostics));

function appendRendererStateLog(label: string, snapshot: unknown) {
  const logDir = path.join(process.cwd(), 'logs', 'windows');
  const logPath = path.join(logDir, 'renderer-state.ndjson');
  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(
    logPath,
    `${JSON.stringify({ label, snapshot, timestamp: new Date().toISOString() })}\n`,
    'utf8'
  );
}

function appendRuntimeEventLog(label: string, payload: Record<string, unknown> = {}) {
  appendRendererStateLog(`event:${label}`, payload);
}

function resolveRendererUrl() {
  return process.env.ELECTRON_RENDERER_URL ?? null;
}

function resolveRendererFilePath() {
  return resolveRendererIndexPath(__dirname, fs.existsSync);
}

function createWindowOptions(): BrowserWindowConstructorOptions {
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
      preload: runtimeDiagnostics.preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  };
}


function focusFirstWindow() {
  const [firstWindow] = BrowserWindow.getAllWindows();
  if (!firstWindow) {
    return;
  }
  if (firstWindow.isMinimized()) {
    firstWindow.restore();
  }
  firstWindow.focus();
}

function wait(ms: number) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

async function loadRenderer(window: ElectronBrowserWindow) {
  const devUrl = resolveRendererUrl();
  if (devUrl) {
    await loadRendererUrlWithRetry(window, devUrl);
    return;
  }
  await window.loadFile(resolveRendererFilePath());
}

function resolveActiveRendererUrl(window: ElectronBrowserWindow) {
  const activeUrl = window.webContents.getURL();
  if (activeUrl) {
    return activeUrl;
  }
  return resolveRendererTargetUrl(__dirname, fs.existsSync);
}

async function loadRendererUrlWithRetry(
  window: ElectronBrowserWindow,
  url: string,
  maxAttempts = 30
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await window.loadURL(url);
      return;
    } catch (error) {
      lastError = error;
      await wait(300);
    }
  }
  throw lastError;
}

function installRuntimeDiagnostics() {
  app.on('render-process-gone', (_, webContents, details) => {
    console.error('[electron-main] render-process-gone', {
      reason: details.reason,
      exitCode: details.exitCode,
      url: webContents.getURL()
    });
  });
  app.on('child-process-gone', (_, details) => {
    console.error('[electron-main] child-process-gone', details);
  });
  process.on('uncaughtException', (error) => {
    console.error('[electron-main] uncaughtException', error);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[electron-main] unhandledRejection', reason);
  });
}

function logRendererStateSnapshot(window: ElectronBrowserWindow, label: string) {
  void window.webContents
    .executeJavaScript(
      `(() => {
        const titlebarButtons = Array.from(document.querySelectorAll('.window-titlebar-button')).map((button) => ({
          ariaLabel: button.getAttribute('aria-label'),
          disabled: button.disabled
        }));
        const backupButton = document.querySelector('button.settings-action-button');
        return {
          backupButton: backupButton ? {
            disabled: backupButton.disabled,
            text: backupButton.textContent?.trim() ?? ''
          } : null,
          bodyTextSample: document.body?.innerText?.slice(0, 200) ?? '',
          bridgeAvailable: typeof window.electronAPI !== 'undefined',
          debugProbeAvailable: typeof window.__FOLIOLE_DESKTOP_DEBUG_PROBE__ !== 'undefined',
          href: window.location.href,
          nativeInvokeReady: typeof window.electronAPI?.invoke === 'function',
          readyState: document.readyState,
          rootPresent: Boolean(document.getElementById('root')),
          titlebarButtons
        };
      })()`,
      true
    )
    .then((snapshot) => {
      console.info(`[electron-main] renderer state snapshot:${label}`, snapshot);
      appendRendererStateLog(label, snapshot);
    })
    .catch((error) => {
      console.error(`[electron-main] renderer state snapshot failed:${label}`, error);
      appendRendererStateLog(label, {
        error: error instanceof Error ? error.message : String(error)
      });
    });
}

function bindWindowIpc(window: ElectronBrowserWindow) {
  ipcMain.handle(IPC_WINDOW_MINIMIZE_CHANNEL, () => {
    window.minimize();
  });

  ipcMain.handle(IPC_WINDOW_TOGGLE_MAXIMIZE_CHANNEL, () => {
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  });

  ipcMain.handle(IPC_WINDOW_IS_MAXIMIZED_CHANNEL, () => window.isMaximized());
  ipcMain.handle(IPC_WINDOW_CLOSE_CHANNEL, () => {
    window.close();
  });

  const publishResize = () => {
    window.webContents.send(IPC_WINDOW_RESIZED_EVENT_CHANNEL);
  };

  window.on('maximize', publishResize);
  window.on('unmaximize', publishResize);
  window.on('resize', publishResize);
}

async function createMainWindow() {
  const restoredWindowState = await loadWindowState();
  const options = applyWindowStateToOptions(createWindowOptions(), restoredWindowState);
  const window = new BrowserWindow(options);
  if (restoredWindowState?.isMaximized) {
    window.maximize();
  }
  bindWindowIpc(window);
  bindWindowStatePersistence(window);
  bindMenuToWindow(window);
  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) {
      appendRuntimeEventLog('ready-to-show');
      window.show();
    }
  });
  window.webContents.on('did-start-navigation', (_, url, isInPlace, isMainFrame) => {
    if (!isMainFrame) {
      return;
    }
    appendRuntimeEventLog('did-start-navigation', { isInPlace, url });
    globalThis.setTimeout(() => {
      if (!window.isDestroyed()) {
        logRendererStateSnapshot(window, 'after-navigation-2000ms');
      }
    }, 2000);
  });
  window.webContents.on('dom-ready', () => {
    appendRuntimeEventLog('dom-ready', {
      url: window.webContents.getURL()
    });
    logRendererStateSnapshot(window, 'dom-ready');
  });
  window.webContents.on('did-stop-loading', () => {
    appendRuntimeEventLog('did-stop-loading', {
      url: window.webContents.getURL()
    });
  });
  window.webContents.on(
    'did-fail-load',
    (_, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) {
        return;
      }
      appendRuntimeEventLog('did-fail-load', {
        errorCode,
        errorDescription,
        validatedURL
      });
      console.error('[electron-main] did-fail-load', {
        errorCode,
        errorDescription,
        validatedURL
      });
    }
  );
  window.webContents.on('did-finish-load', () => {
    appendRuntimeEventLog('did-finish-load', {
      url: window.webContents.getURL()
    });
    void window.webContents
      .executeJavaScript(
        `(() => ({
          bridgeAvailable: typeof window.electronAPI !== 'undefined',
          debugProbeAvailable: typeof window.__FOLIOLE_DESKTOP_DEBUG_PROBE__ !== 'undefined',
          href: window.location.href,
          readyState: document.readyState
        }))()`,
        true
      )
      .then((snapshot) => {
        console.info('[electron-main] renderer bridge snapshot', snapshot);
      })
      .catch((error) => {
        console.error('[electron-main] renderer bridge snapshot failed', error);
      });
    logRendererStateSnapshot(window, 'did-finish-load');
    globalThis.setTimeout(() => {
      if (!window.isDestroyed()) {
        logRendererStateSnapshot(window, 'after-1000ms');
      }
    }, 1000);
  });
  await loadRenderer(window);
  console.info(
    '[electron-main] active runtime diagnostics',
    formatRuntimeDiagnosticsSnapshot({
      ...runtimeDiagnostics,
      rendererUrl: resolveActiveRendererUrl(window)
    })
  );
}

function installInvokeHandler() {
  ipcMain.handle(IPC_INVOKE_CHANNEL, async (event, request: InvokeRequest) =>
    handleInvokeRequest(request, { sender: event.sender })
  );
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

const devRestartIntentWatcher = installDevRestartIntentWatcher({ app });

app.on('second-instance', () => {
  focusFirstWindow();
});

app.on('before-quit', () => {
  devRestartIntentWatcher?.close();
});

app.whenReady().then(async () => {
  installRuntimeDiagnostics();
  initializeDatabase();
  installInvokeHandler();
  installAppMenu();
  await migrateLegacyWebviewStorage();
  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
