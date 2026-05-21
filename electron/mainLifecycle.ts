import { app, BrowserWindow } from 'electron';

import { beginDatabaseStartup, markDatabaseReady, markDatabaseStartupFailed } from './database/databaseReadiness.js';
import { loadOrCreateDesktopDeviceId } from './database/deviceIdentity.js';
import { initializeDatabase } from './database/migrate.js';
import { flushAllDirtyNodeSyncVersions } from './database/nodeMutations.js';
import { stopSearchIndexInvalidationScheduler } from './database/searchIndexInvalidationScheduler.js';
import { installDevRendererReloadIntentWatcher } from './devRendererReloadIntent.js';
import { installDevRestartIntentWatcher } from './devRestartIntent.js';
import { stopDevScreenshotServer } from './devScreenshotServer.js';
import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';
import { installExternalDocumentFileOpenLifecycle } from './externalDocumentFileOpen.js';
import { notifyExternalSearchSecondInstance, notifyExternalSearchUserActivity, stopExternalSearchBackgroundRefresh } from './externalSearchBackgroundRefreshRuntime.js';
import { stopKeepImportMonitor } from './import/keepImportMonitor.js';
import { stopManagedInboxMonitor } from './import/managedInboxMonitor.js';
import { appendBootEvent } from './ipc/boot.js';
import { installAppMenu } from './ipc/menu.js';
import { resolveAppPaths } from './ipc/paths.js';
import { startInitialMainWindow } from './mainStartup.js';
import { flushMirrorSync } from './mirror/mirrorSyncScheduler.js';
import type { StartupRendererView } from './rendererLoader.js';
import { bindEmbeddedLinkPanelContents, focusWindow, installMainRuntimeDiagnostics } from './runtimeMainSupport.js';
import type { RuntimeMode } from './runtimeMode.js';
import { isDesktopCompanionSyncEnabled } from './sync/desktopCompanionSyncPreference.js';
import { ensureLanWorkspaceSyncServer, setLanWorkspaceSyncPairRequestHandler, stopLanWorkspaceSyncServer } from './sync/lanWorkspaceSyncServer.js';
import { presentInitialRendererWindow } from './windowRuntimeDiagnostics.js';

const IPC_COMPANION_PAIRING_REQUESTS_CHANGED_CHANNEL = 'foliole:companion-pairing-requests-changed';

export interface MainLifecycleArgs {
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
    stopSearchIndexInvalidationScheduler();
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
  try {
    await appendBootEvent('database_init_start');
    await appendBootEvent('database_initialize_call_start');
    initializeDatabase((stage, payload = null) => {
      void appendBootEvent(stage, payload).catch((error) => appendMainProcessDiagnosticLog('boot_log_failed', {
        error,
        stage
      }));
    });
    await appendBootEvent('database_initialize_call_complete');
    if (process.env.FOLIOLE_SKIP_STARTUP_NODE_SYNC_FLUSH === '1') {
      await appendBootEvent('node_sync_flush_skipped', {
        reason: 'startup-node-sync-flush-disabled'
      });
      await appendBootEvent('database_init_complete');
      installAppMenu();
      markDatabaseReady();
      return;
    }
    await appendBootEvent('node_sync_flush_start');
    flushAllDirtyNodeSyncVersions();
    await appendBootEvent('node_sync_flush_complete');
    await appendBootEvent('database_init_complete');
    installAppMenu();
    markDatabaseReady();
  } catch (error) {
    markDatabaseStartupFailed(error);
    throw error;
  }
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

function installAppProcessDiagnostics() {
  installMainRuntimeDiagnostics();
  app.on('render-process-gone', (_, webContents, details) => appendMainProcessDiagnosticLog('render_process_gone', { ...details, url: webContents.getURL() }));
  app.on('child-process-gone', (_, details) => appendMainProcessDiagnosticLog('child_process_gone', { ...details }));
  app.on('web-contents-created', (_, contents) => bindEmbeddedLinkPanelContents(contents));
}

function installActivateLifecycle(
  args: MainLifecycleArgs,
  onWindowReady: (window: BrowserWindow) => void
) {
  app.on('activate', async () => {
    notifyExternalSearchUserActivity();
    if (BrowserWindow.getAllWindows().length !== 0) {
      return;
    }
    const window = await args.createMainWindow();
    await args.loadMainWindow(window);
    await presentInitialRendererWindow(window);
    await args.activateMainWindow(window);
    onWindowReady(window);
  });
}

export function installMainLifecycle(args: MainLifecycleArgs) {
  const externalDocumentFileOpen = installExternalDocumentFileOpenLifecycle();
  installSingleInstanceGate(args.runtimeMode);
  installBeforeQuitLifecycle();
  app.on('second-instance', (_event, argv) => {
    focusWindow(BrowserWindow.getAllWindows()[0]);
    externalDocumentFileOpen.enqueueFromArgv(argv);
    notifyExternalSearchSecondInstance();
  });
  app.whenReady().then(async () => {
    installAppProcessDiagnostics();
    args.installInvokeHandler();
    await appendBootEvent('app_when_ready');
    beginDatabaseStartup();
    const mainWindow = await args.createMainWindow();
    await startInitialMainWindow(args, {
      failDatabaseStartup: markDatabaseStartupFailed,
      initializeRuntimeServices,
      installPairingFocusHandler,
      loadStartupErrorSurface: (input) => loadStartupErrorSurface({ ...input, loadMainWindow: args.loadMainWindow }),
      mainWindow,
      startCompanionSyncIfEnabled
    });
    externalDocumentFileOpen.setReadyWindow(mainWindow);
    installActivateLifecycle(args, externalDocumentFileOpen.setReadyWindow);
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
