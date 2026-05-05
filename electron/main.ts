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
import { migrateLegacyWorkspaceState } from './ipc/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolvePreloadPath() {
  const sourcePreloadPath = path.join(__dirname, '..', 'electron', 'preload.cjs');
  if (fs.existsSync(sourcePreloadPath)) {
    return sourcePreloadPath;
  }
  return path.join(__dirname, 'preload.cjs');
}

function resolveRendererUrl() {
  return process.env.ELECTRON_RENDERER_URL ?? null;
}

function resolveRendererFilePath() {
  return path.join(__dirname, '..', 'dist', 'index.html');
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
      preload: resolvePreloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  };
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
  const window = new BrowserWindow(createWindowOptions());
  bindWindowIpc(window);
  bindMenuToWindow(window);
  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) {
      window.show();
    }
  });
  window.webContents.on(
    'did-fail-load',
    (_, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) {
        return;
      }
      console.error('[electron-main] did-fail-load', {
        errorCode,
        errorDescription,
        validatedURL
      });
    }
  );
  await loadRenderer(window);
}

function installInvokeHandler() {
  ipcMain.handle(IPC_INVOKE_CHANNEL, async (event, request: InvokeRequest) =>
    handleInvokeRequest(request, { sender: event.sender })
  );
}

app.whenReady().then(async () => {
  installRuntimeDiagnostics();
  installInvokeHandler();
  installAppMenu();
  await migrateLegacyWorkspaceState('foliole-workspace-v1');
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
