import { app, BrowserWindow } from 'electron';

import { registerAttachmentProtocol } from './attachments/attachmentProtocol.js';
import { reconcileAutomaticDatabaseBackups } from './database/backupRestore.js';
import { loadOrCreateDesktopDeviceId } from './database/deviceIdentity.js';
import { initializeDatabase } from './database/migrate.js';
import { flushAllDirtyNodeSyncVersions } from './database/nodeMutations.js';
import { resumePendingPdfAttachmentIndexing } from './database/pdfIndexing.js';
import { installDevRendererReloadIntentWatcher } from './devRendererReloadIntent.js';
import { installDevRestartIntentWatcher } from './devRestartIntent.js';
import { startDevScreenshotServer, stopDevScreenshotServer } from './devScreenshotServer.js';
import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';
import { notifyExternalSearchSecondInstance, notifyExternalSearchUserActivity, startExternalSearchBackgroundRefresh, stopExternalSearchBackgroundRefresh } from './externalSearchBackgroundRefreshRuntime.js';
import { startKeepImportMonitor, stopKeepImportMonitor } from './import/keepImportMonitor.js';
import { startManagedInboxMonitor, stopManagedInboxMonitor } from './import/managedInboxMonitor.js';
import { loadReadwiseBooksInventory } from './import/readwiseBooksInventory.js';
import { appendBootEvent } from './ipc/boot.js';
import { migrateLegacyWebviewStorage } from './ipc/legacyWebviewStorage.js';
import { installAppMenu } from './ipc/menu.js';
import { resolveAppPaths } from './ipc/paths.js';
import { flushMirrorSync } from './mirror/mirrorSyncScheduler.js';
import { backfillMissingMirrorOutput } from './mirror/rebuildMirrorOutput.js';
import type { StartupRendererView } from './rendererLoader.js';
import { bindEmbeddedLinkPanelContents, focusWindow, installMainRuntimeDiagnostics } from './runtimeMainSupport.js';
import type { RuntimeMode } from './runtimeMode.js';
import { runStartupTask } from './startupTasks.js';
import { isDesktopCompanionSyncEnabled } from './sync/desktopCompanionSyncPreference.js';
import { ensureLanWorkspaceSyncServer, setLanWorkspaceSyncPairRequestHandler, stopLanWorkspaceSyncServer } from './sync/lanWorkspaceSyncServer.js';
import { presentInitialRendererWindow } from './windowRuntimeDiagnostics.js';

const IPC_COMPANION_PAIRING_REQUESTS_CHANGED_CHANNEL = 'foliole:companion-pairing-requests-changed';

interface MainLifecycleArgs {
  activateMainWindow: (window: BrowserWindow) => Promise<void>;
  createMainWindow: (startupAppearance?: { backgroundColor: string } | null) => Promise<BrowserWindow>;
  installInvokeHandler: () => void;
  loadMainWindow: (window: BrowserWindow, startupView?: StartupRendererView | null) => Promise<void>;
  runtimeMode: RuntimeMode;
}

function installSingleInstanceGate(runtimeMode: RuntimeMode) {
  if (runtimeMode.allowParallelInstance) {
    return;
  }
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
  }
}

function installBeforeQuitLifecycle() {
  const devRestartIntentWatcher = installDevRestartIntentWatcher({ app, getWindows: () => BrowserWindow.getAllWindows() });
  const devRendererReloadIntentWatcher = installDevRendererReloadIntentWatcher({ getWindows: () => BrowserWindow.getAllWindows() });
  let mirrorFlushed = false;
  app.on('before-quit', (event) => {
    devRestartIntentWatcher?.close();
    devRendererReloadIntentWatcher?.close();
    stopExternalSearchBackgroundRefresh();
    stopManagedInboxMonitor();
    stopKeepImportMonitor();
    void stopDevScreenshotServer().catch((error) => appendMainProcessDiagnosticLog('dev_screenshot_stop_failed', { error }));
    void stopLanWorkspaceSyncServer().catch((error) => appendMainProcessDiagnosticLog('lan_sync_stop_failed', { error }));
    if (mirrorFlushed) return;
    mirrorFlushed = true;
    event.preventDefault();
    try {
      flushAllDirtyNodeSyncVersions();
    } catch (error) {
      appendMainProcessDiagnosticLog('node_sync_flush_on_quit_failed', { error });
    }
    flushMirrorSync().catch((error) => appendMainProcessDiagnosticLog('mirror_flush_on_quit_failed', { error })).finally(() => app.quit());
  });
}

async function initializeRuntimeServices() {
  await appendBootEvent('database_init_start');
  await appendBootEvent('database_initialize_call_start');
  initializeDatabase((stage, payload = null) => {
    void appendBootEvent(stage, payload).catch((error) => appendMainProcessDiagnosticLog('boot_log_failed', {
      error,
      stage
    }));
  });
  await appendBootEvent('database_initialize_call_complete');
  await appendBootEvent('node_sync_flush_start');
  flushAllDirtyNodeSyncVersions();
  await appendBootEvent('node_sync_flush_complete');
  await appendBootEvent('database_init_complete');
  installAppMenu();
}

function toStartupErrorSummary(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.trim()) {
    return 'Unknown startup exception';
  }
  return message.trim().slice(0, 900);
}

function resolveStartupLogPath() {
  try {
    return resolveAppPaths().app_log_dir;
  } catch {
    return null;
  }
}

function createStartupErrorView(error: unknown, moduleLabel: string): StartupRendererView {
  return {
    errorSummary: toStartupErrorSummary(error),
    kind: 'startup-error',
    logPath: resolveStartupLogPath(),
    moduleLabel
  };
}

async function reportStartupRuntimeServicesFailure(error: unknown, moduleLabel: string) {
  appendMainProcessDiagnosticLog('startup_runtime_services_failed', { error });
  await appendBootEvent('startup_runtime_services_failed', {
    message: toStartupErrorSummary(error),
    moduleLabel
  });
}

async function loadStartupErrorSurface(args: {
  error: unknown;
  moduleLabel: string;
  window: BrowserWindow;
  loadMainWindow: MainLifecycleArgs['loadMainWindow'];
}) {
  await reportStartupRuntimeServicesFailure(args.error, args.moduleLabel);
  if (!args.window.isDestroyed()) {
    await args.loadMainWindow(args.window, createStartupErrorView(args.error, args.moduleLabel));
    if (!args.window.isVisible()) {
      args.window.show();
    }
  }
}

async function startCompanionSyncIfEnabled() {
  if (!isDesktopCompanionSyncEnabled()) {
    return;
  }
  await ensureLanWorkspaceSyncServer({ appVersion: app.getVersion(), peerId: loadOrCreateDesktopDeviceId() });
}

function installPairingFocusHandler() {
  setLanWorkspaceSyncPairRequestHandler(() => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return;
    if (!window.isVisible()) window.show();
    focusWindow(window);
    window.webContents.send(IPC_COMPANION_PAIRING_REQUESTS_CHANGED_CHANNEL);
  });
}

function startFollowupTasks() {
  void runStartupTask('[backup] automatic backup reconcile failed', reconcileAutomaticDatabaseBackups);
  void runStartupTask('[mirror] startup backfill failed', backfillMissingMirrorOutput);
  void runStartupTask('[storage] legacy webview migration failed', migrateLegacyWebviewStorage);
  resumePendingPdfAttachmentIndexing();
  void appendBootEvent('startup_followup_tasks_started');
  void runStartupTask('[managed-inbox] startup monitor failed', startManagedInboxMonitor);
  void runStartupTask('[keep-import] startup monitor failed', startKeepImportMonitor);
  void runStartupTask('[readwise-books] startup node sync failed', loadReadwiseBooksInventory);
  startExternalSearchBackgroundRefresh();
}

function installAppProcessDiagnostics() {
  installMainRuntimeDiagnostics();
  app.on('render-process-gone', (_, webContents, details) => appendMainProcessDiagnosticLog('render_process_gone', { ...details, url: webContents.getURL() }));
  app.on('child-process-gone', (_, details) => appendMainProcessDiagnosticLog('child_process_gone', { ...details }));
  app.on('web-contents-created', (_, contents) => bindEmbeddedLinkPanelContents(contents));
}

function installActivateLifecycle(args: MainLifecycleArgs) {
  app.on('activate', async () => {
    notifyExternalSearchUserActivity();
    if (BrowserWindow.getAllWindows().length !== 0) {
      return;
    }
    const window = await args.createMainWindow();
    await args.loadMainWindow(window);
    await presentInitialRendererWindow(window);
    await args.activateMainWindow(window);
  });
}

export function installMainLifecycle(args: MainLifecycleArgs) {
  installSingleInstanceGate(args.runtimeMode);
  installBeforeQuitLifecycle();
  app.on('second-instance', () => {
    focusWindow(BrowserWindow.getAllWindows()[0]);
    notifyExternalSearchSecondInstance();
  });
  app.whenReady().then(async () => {
    installAppProcessDiagnostics();
    args.installInvokeHandler();
    await appendBootEvent('app_when_ready');
    const mainWindow = await args.createMainWindow();
    startDevScreenshotServer({ getWindow: () => mainWindow });
    try {
      registerAttachmentProtocol();
      await args.loadMainWindow(mainWindow);
      await appendBootEvent('main_window_shell_ready');
      await presentInitialRendererWindow(mainWindow);
    } catch (error) {
      await loadStartupErrorSurface({
        error,
        loadMainWindow: args.loadMainWindow,
        moduleLabel: 'Workspace shell',
        window: mainWindow
      });
      return;
    }
    try {
      await initializeRuntimeServices();
    } catch (error) {
      await loadStartupErrorSurface({
        error,
        loadMainWindow: args.loadMainWindow,
        moduleLabel: 'Database migration',
        window: mainWindow
      });
      return;
    }
    try {
      installPairingFocusHandler();
      await startCompanionSyncIfEnabled();
      await args.activateMainWindow(mainWindow);
      await appendBootEvent('main_window_ready');
      startFollowupTasks();
    } catch (error) {
      await loadStartupErrorSurface({
        error,
        loadMainWindow: args.loadMainWindow,
        moduleLabel: 'Startup services',
        window: mainWindow
      });
    }
    installActivateLifecycle(args);
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
