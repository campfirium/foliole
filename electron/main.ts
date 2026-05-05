import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  app,
  BrowserWindow,
  ipcMain,
  type BrowserWindow as ElectronBrowserWindow
} from 'electron';

import { registerAttachmentProtocol, registerAttachmentProtocolScheme } from './attachments/attachmentProtocol.js';
import { reconcileAutomaticDatabaseBackups } from './database/backupRestore.js';
import { initializeDatabase } from './database/migrate.js';
import { flushAllDirtyNodeSyncVersions } from './database/nodeMutations.js';
import { resumePendingPdfAttachmentIndexing } from './database/pdfIndexing.js';
import { installDevRendererReloadIntentWatcher } from './devRendererReloadIntent.js';
import { installDevRestartIntentWatcher } from './devRestartIntent.js';
import { appendDiagnosticLog, parseDiagnosticLogPayload } from './diagnostics/diagnosticLog.js';
import {
  notifyExternalSearchSecondInstance,
  notifyExternalSearchUserActivity,
  startExternalSearchBackgroundRefresh,
  stopExternalSearchBackgroundRefresh
} from './externalSearchBackgroundRefreshRuntime.js';
import { startKeepImportMonitor, stopKeepImportMonitor } from './import/keepImportMonitor.js';
import { startManagedInboxMonitor, stopManagedInboxMonitor } from './import/managedInboxMonitor.js';
import { loadReadwiseBooksInventory } from './import/readwiseBooksInventory.js';
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
import { migrateLegacyWebviewStorage } from './ipc/legacyWebviewStorage.js';
import { bindMenuToWindow, installAppMenu } from './ipc/menu.js';
import { loadWindowState } from './ipc/windowState.js';
import { flushMirrorSync } from './mirror/mirrorSyncScheduler.js';
import { backfillMissingMirrorOutput } from './mirror/rebuildMirrorOutput.js';
import { bindWindowReadingProgressFlush } from './readingProgressWindowFlush.js';
import {
  collectRuntimeDiagnosticsSnapshot,
  configureRuntimeAppIdentity,
  formatRuntimeDiagnosticsSnapshot
} from './runtimeIdentity.js';
import {
  bindEmbeddedLinkPanelContents,
  createMainWindowOptions,
  focusWindow,
  installMainRuntimeDiagnostics,
  loadMainWindowRenderer,
  logWindowStateLifecycleEvent,
  logWindowStateRestoreDecision
} from './runtimeMainSupport.js';
import { resolveRuntimeMode } from './runtimeMode.js';
import { runStartupTask } from './startupTasks.js';
import { isDesktopCompanionSyncEnabled } from './sync/desktopCompanionSyncPreference.js';
import {
  ensureLanWorkspaceSyncServer,
  setLanWorkspaceSyncPairRequestHandler,
  stopLanWorkspaceSyncServer
} from './sync/lanWorkspaceSyncServer.js';
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

if (!runtimeMode.allowParallelInstance) {
  const hasSingleInstanceLock = app.requestSingleInstanceLock();
  if (!hasSingleInstanceLock) {
    app.quit();
    process.exit(0);
  }
}

const devRestartIntentWatcher = installDevRestartIntentWatcher({
  app,
  getWindows: () => BrowserWindow.getAllWindows()
});
const devRendererReloadIntentWatcher = installDevRendererReloadIntentWatcher({
  getWindows: () => BrowserWindow.getAllWindows()
});

app.on('second-instance', () => {
  focusWindow(BrowserWindow.getAllWindows()[0]);
  notifyExternalSearchSecondInstance();
});

let mirrorFlushed = false;
app.on('before-quit', (event) => {
  devRestartIntentWatcher?.close();
  devRendererReloadIntentWatcher?.close();
  stopExternalSearchBackgroundRefresh();
  stopManagedInboxMonitor();
  stopKeepImportMonitor();
  void stopLanWorkspaceSyncServer().catch((error) => {
    console.error('[companion-sync] stop lan workspace sync server failed', error);
  });
  if (!mirrorFlushed) {
    mirrorFlushed = true;
    event.preventDefault();
    try {
      flushAllDirtyNodeSyncVersions();
    } catch (error) {
      console.error('[database] flush dirty node sync versions on quit failed', error);
    }
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
  installMainRuntimeDiagnostics();
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
  await appendBootEvent('app_when_ready');
  app.on('web-contents-created', (_, contents) => {
    bindEmbeddedLinkPanelContents(contents);
  });
  await appendBootEvent('database_init_start');
  await appendBootEvent('database_initialize_call_start');
  initializeDatabase((stage, payload = null) => {
    void appendBootEvent(stage, payload).catch((error) => {
      console.error(`[electron-main] boot log failed: ${stage}`, error);
    });
  });
  await appendBootEvent('database_initialize_call_complete');
  await appendBootEvent('node_sync_flush_start');
  flushAllDirtyNodeSyncVersions();
  await appendBootEvent('node_sync_flush_complete');
  await appendBootEvent('database_init_complete');
  registerAttachmentProtocol();
  installInvokeHandler();
  installAppMenu();
  setLanWorkspaceSyncPairRequestHandler(() => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) {
      return;
    }
    if (!window.isVisible()) {
      window.show();
    }
    focusWindow(window);
  });
  if (isDesktopCompanionSyncEnabled()) {
    await ensureLanWorkspaceSyncServer({
      appVersion: app.getVersion(),
      peerId: 'desktop-local'
    });
  }
  await createMainWindow();
  await appendBootEvent('main_window_ready');
  void runStartupTask('[backup] automatic backup reconcile failed', reconcileAutomaticDatabaseBackups);
  void runStartupTask('[mirror] startup backfill failed', backfillMissingMirrorOutput);
  void runStartupTask('[storage] legacy webview migration failed', migrateLegacyWebviewStorage);
  resumePendingPdfAttachmentIndexing();
  await appendBootEvent('startup_followup_tasks_started');
  void runStartupTask('[managed-inbox] startup monitor failed', startManagedInboxMonitor);
  void runStartupTask('[keep-import] startup monitor failed', startKeepImportMonitor);
  void runStartupTask('[readwise-books] startup node sync failed', loadReadwiseBooksInventory);
  startExternalSearchBackgroundRefresh();

  app.on('activate', async () => {
    notifyExternalSearchUserActivity();
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
