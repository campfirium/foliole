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

import { registerAttachmentProtocol, registerAttachmentProtocolScheme } from './attachments/attachmentProtocol.js';
import { reconcileAutomaticDatabaseBackups } from './database/backupRestore.js';
import { initializeDatabase } from './database/migrate.js';
import { resumePendingPdfAttachmentIndexing } from './database/pdfIndexing.js';
import { installDevRendererReloadIntentWatcher } from './devRendererReloadIntent.js';
import { installDevRestartIntentWatcher } from './devRestartIntent.js';
import { startKeepImportMonitor, stopKeepImportMonitor } from './import/keepImportMonitor.js';
import { startManagedInboxMonitor, stopManagedInboxMonitor } from './import/managedInboxMonitor.js';
import { loadReadwiseBooksInventory } from './import/readwiseBooksInventory.js';
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
import { flushMirrorSync } from './mirror/mirrorSyncScheduler.js';
import { backfillMissingMirrorOutput } from './mirror/rebuildMirrorOutput.js';
import { loadRenderer, logActiveRuntimeDiagnostics } from './rendererLoader.js';
import {
  collectRuntimeDiagnosticsSnapshot,
  configureRuntimeAppIdentity,
  formatRuntimeDiagnosticsSnapshot
} from './runtimeIdentity.js';
import { bindWindowRuntimeDiagnostics } from './windowRuntimeDiagnostics.js';
import { logWindowStateLifecycleEvent, logWindowStateRestoreDecision } from './windowStateDiagnostics.js';
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
registerAttachmentProtocolScheme();

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
  const restoredWindowState = await loadWindowState();
  logWindowStateRestoreDecision('window-state-loaded', restoredWindowState);
  const options = applyWindowStateToOptions(createWindowOptions(), restoredWindowState);
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
  logWindowStateLifecycleEvent('window-created', window);
  if (restoredWindowState?.isFullScreen) {
    window.setFullScreen(true);
    logWindowStateLifecycleEvent('window-restore-fullscreen', window);
  } else if (restoredWindowState?.isMaximized) {
    window.maximize();
    logWindowStateLifecycleEvent('window-restore-maximize', window);
  }
  bindWindowIpc(window);
  bindWindowStatePersistence(window);
  bindMenuToWindow(window);
  bindWindowRuntimeDiagnostics(window);
  await loadRenderer(window, __dirname);
  logActiveRuntimeDiagnostics(window, __dirname, runtimeDiagnostics);
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

const devRestartIntentWatcher = installDevRestartIntentWatcher({
  app,
  getWindows: () => BrowserWindow.getAllWindows()
});
const devRendererReloadIntentWatcher = installDevRendererReloadIntentWatcher({
  getWindows: () => BrowserWindow.getAllWindows()
});

app.on('second-instance', () => {
  focusFirstWindow();
});

let mirrorFlushed = false;
app.on('before-quit', (event) => {
  devRestartIntentWatcher?.close();
  devRendererReloadIntentWatcher?.close();
  stopManagedInboxMonitor();
  stopKeepImportMonitor();
  if (!mirrorFlushed) {
    mirrorFlushed = true;
    event.preventDefault();
    flushMirrorSync()
      .catch((error) => {
        console.error('[mirror] flush on quit failed', error);
      })
      .finally(() => {
        app.quit();
      });
  }
});

app.whenReady().then(async () => {
  installRuntimeDiagnostics();
  initializeDatabase();
  try {
    await reconcileAutomaticDatabaseBackups();
  } catch (error) {
    console.error('[backup] automatic backup reconcile failed', error);
  }
  try {
    await backfillMissingMirrorOutput();
  } catch (error) {
    console.error('[mirror] startup backfill failed', error);
  }
  registerAttachmentProtocol();
  installInvokeHandler();
  installAppMenu();
  await migrateLegacyWebviewStorage();
  resumePendingPdfAttachmentIndexing();
  await startManagedInboxMonitor();
  await startKeepImportMonitor();
  await loadReadwiseBooksInventory().catch((error) => {
    console.error('[readwise-books] startup node sync failed', error);
  });
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
