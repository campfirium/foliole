import { app, BrowserWindow } from 'electron';

import { registerAttachmentProtocol } from './attachments/attachmentProtocol.js';
import { reconcileAutomaticDatabaseBackups } from './database/backupRestore.js';
import { initializeDatabase } from './database/migrate.js';
import { flushAllDirtyNodeSyncVersions } from './database/nodeMutations.js';
import { resumePendingPdfAttachmentIndexing } from './database/pdfIndexing.js';
import { installDevRendererReloadIntentWatcher } from './devRendererReloadIntent.js';
import { installDevRestartIntentWatcher } from './devRestartIntent.js';
import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';
import { notifyExternalSearchSecondInstance, notifyExternalSearchUserActivity, startExternalSearchBackgroundRefresh, stopExternalSearchBackgroundRefresh } from './externalSearchBackgroundRefreshRuntime.js';
import { startKeepImportMonitor, stopKeepImportMonitor } from './import/keepImportMonitor.js';
import { startManagedInboxMonitor, stopManagedInboxMonitor } from './import/managedInboxMonitor.js';
import { loadReadwiseBooksInventory } from './import/readwiseBooksInventory.js';
import { appendBootEvent } from './ipc/boot.js';
import { migrateLegacyWebviewStorage } from './ipc/legacyWebviewStorage.js';
import { installAppMenu } from './ipc/menu.js';
import { flushMirrorSync } from './mirror/mirrorSyncScheduler.js';
import { backfillMissingMirrorOutput } from './mirror/rebuildMirrorOutput.js';
import { bindEmbeddedLinkPanelContents, focusWindow, installMainRuntimeDiagnostics } from './runtimeMainSupport.js';
import type { RuntimeMode } from './runtimeMode.js';
import { runStartupTask } from './startupTasks.js';
import { isDesktopCompanionSyncEnabled } from './sync/desktopCompanionSyncPreference.js';
import { ensureLanWorkspaceSyncServer, setLanWorkspaceSyncPairRequestHandler, stopLanWorkspaceSyncServer } from './sync/lanWorkspaceSyncServer.js';

const IPC_COMPANION_PAIRING_REQUESTS_CHANGED_CHANNEL = 'foliole:companion-pairing-requests-changed';

interface MainLifecycleArgs {
  createMainWindow: () => Promise<void>;
  installInvokeHandler: () => void;
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

async function initializeRuntimeServices(args: MainLifecycleArgs) {
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
  registerAttachmentProtocol();
  args.installInvokeHandler();
  installAppMenu();
}

async function startCompanionSyncIfEnabled() {
  if (!isDesktopCompanionSyncEnabled()) {
    return;
  }
  await ensureLanWorkspaceSyncServer({ appVersion: app.getVersion(), peerId: 'desktop-local' });
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

export function installMainLifecycle(args: MainLifecycleArgs) {
  installSingleInstanceGate(args.runtimeMode);
  installBeforeQuitLifecycle();
  app.on('second-instance', () => {
    focusWindow(BrowserWindow.getAllWindows()[0]);
    notifyExternalSearchSecondInstance();
  });
  app.whenReady().then(async () => {
    installAppProcessDiagnostics();
    await appendBootEvent('app_when_ready');
    await initializeRuntimeServices(args);
    installPairingFocusHandler();
    await startCompanionSyncIfEnabled();
    await args.createMainWindow();
    await appendBootEvent('main_window_ready');
    startFollowupTasks();
    app.on('activate', async () => {
      notifyExternalSearchUserActivity();
      if (BrowserWindow.getAllWindows().length === 0) await args.createMainWindow();
    });
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
