import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  app,
  BrowserWindow,
  ipcMain,
  type BrowserWindow as ElectronBrowserWindow
} from 'electron';

import { registerAttachmentProtocolScheme } from './attachments/attachmentProtocol.js';
import { appendDiagnosticLog, parseDiagnosticLogPayload } from './diagnostics/diagnosticLog.js';
import { appendBootEvent } from './ipc/boot.js';
import { handleInvokeRequest } from './ipc/commands.js';
import {
  IPC_DIAGNOSTIC_LOG_CHANNEL,
  IPC_INVOKE_CHANNEL,
  IPC_WINDOW_CLOSE_CHANNEL,
  IPC_WINDOW_IS_MAXIMIZED_CHANNEL,
  IPC_WINDOW_MINIMIZE_CHANNEL,
  IPC_WINDOW_RESIZED_EVENT_CHANNEL,
  IPC_WINDOW_TOGGLE_MAXIMIZE_CHANNEL,
  type InvokeRequest
} from './ipc/contracts.js';
import { bindHotkeyRecorderInput } from './ipc/hotkeyRecorderInput.js';
import { bindMenuToWindow } from './ipc/menu.js';
import { loadWindowState } from './ipc/windowState.js';
import { installMainLifecycle } from './mainLifecycle.js';
import { bindWindowReadingProgressFlush } from './readingProgressWindowFlush.js';
import {
  collectRuntimeDiagnosticsSnapshot,
  configureRuntimeAppIdentity,
  formatRuntimeDiagnosticsSnapshot
} from './runtimeIdentity.js';
import {
  createMainWindowOptions,
  loadMainWindowRenderer,
  logWindowStateLifecycleEvent,
  logWindowStateRestoreDecision
} from './runtimeMainSupport.js';
import { resolveRuntimeMode } from './runtimeMode.js';
import { bindWindowRuntimeDiagnostics } from './windowRuntimeDiagnostics.js';
import { applyWindowStateToOptions, bindWindowStatePersistence } from './windowStateLifecycle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configuredIdentity = configureRuntimeAppIdentity(app, fs.mkdirSync.bind(fs));
const runtimeMode = resolveRuntimeMode();
const runtimeDiagnostics = collectRuntimeDiagnosticsSnapshot({
  appName: configuredIdentity.appName,
  existsSync: fs.existsSync,
  runtimeDir: __dirname,
  userDataPath: configuredIdentity.userDataPath
});

console.info('[electron-main] app identity configured', configuredIdentity);
console.info('[electron-main] runtime diagnostics', formatRuntimeDiagnosticsSnapshot(runtimeDiagnostics));
registerAttachmentProtocolScheme();
void appendBootEvent('main_process_start', {
  appName: configuredIdentity.appName,
  runtimeMode
}).catch((error) => {
  console.error('[electron-main] boot log failed: main_process_start', error);
});

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
  await appendBootEvent('main_window_create_start');
  const restoredWindowState = await loadWindowState();
  await appendBootEvent('window_state_loaded', restoredWindowState);
  logWindowStateRestoreDecision('window-state-loaded', restoredWindowState);
  const options = applyWindowStateToOptions(createMainWindowOptions(runtimeDiagnostics.preloadPath), restoredWindowState);
  logWindowStateRestoreDecision('window-options-applied', restoredWindowState, {
    options: {
      fullscreen: options.fullscreen ?? false,
      height: options.height,
      width: options.width,
      x: options.x,
      y: options.y
    }
  });
  const window = new BrowserWindow(options);
  await appendBootEvent('browser_window_created', {
    bounds: window.getBounds(),
    show: window.isVisible()
  });
  logWindowStateLifecycleEvent('window-created', window);
  if (restoredWindowState?.isFullScreen) {
    window.setFullScreen(true);
    logWindowStateLifecycleEvent('window-restore-fullscreen', window);
  } else if (restoredWindowState?.isMaximized) {
    window.maximize();
    logWindowStateLifecycleEvent('window-restore-maximize', window);
  }
  bindWindowIpc(window);
  bindHotkeyRecorderInput(window);
  bindWindowReadingProgressFlush(window);
  bindWindowStatePersistence(window);
  bindMenuToWindow(window);
  bindWindowRuntimeDiagnostics(window);
  await appendBootEvent('renderer_load_start');
  await loadMainWindowRenderer({ runtimeDiagnostics, runtimeDir: __dirname, window });
  await appendBootEvent('renderer_load_complete', {
    url: window.webContents.getURL()
  });
}

function installInvokeHandler() {
  ipcMain.handle(IPC_DIAGNOSTIC_LOG_CHANNEL, async (_event, payload: unknown) => {
    await appendDiagnosticLog(parseDiagnosticLogPayload(payload));
  });
  ipcMain.handle(IPC_INVOKE_CHANNEL, async (event, request: InvokeRequest) =>
    handleInvokeRequest(request, { sender: event.sender })
  );
}

installMainLifecycle({ createMainWindow, installInvokeHandler, runtimeMode });
