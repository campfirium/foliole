import path from 'node:path';
import { fileURLToPath } from 'node:url';

import electron, {
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
import { bindMenuToWindow, installAppMenu } from './ipc/menu.js';

const { app, BrowserWindow, ipcMain } = electron;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolvePreloadPath() {
  return path.join(__dirname, 'preload.js');
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
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  };
}

async function loadRenderer(window: ElectronBrowserWindow) {
  const devUrl = resolveRendererUrl();
  if (devUrl) {
    await window.loadURL(devUrl);
    return;
  }
  await window.loadFile(resolveRendererFilePath());
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
  await loadRenderer(window);
}

function installInvokeHandler() {
  ipcMain.handle(IPC_INVOKE_CHANNEL, async (_, request: InvokeRequest) =>
    handleInvokeRequest(request)
  );
}

app.whenReady().then(async () => {
  installInvokeHandler();
  installAppMenu();
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
