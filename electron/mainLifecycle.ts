import { app, BrowserWindow } from 'electron';

import { ensureAgentControlApiServer, stopAgentControlApiServer } from './agentControl/agentControlServer.js';
import { resolveFolioleAppVersion } from './appVersion.js';
import { installBackgroundTray, markAppQuittingForBackgroundPresence } from './backgroundPresence.js';
import { beginDatabaseStartup, markDatabaseReady, markDatabaseStartupFailed } from './database/databaseReadiness.js';
import { loadOrCreateDesktopDeviceId } from './database/deviceIdentity.js';
import { initializeDatabase } from './database/migrate.js';
import { flushAllDirtyNodeSyncVersions } from './database/nodeMutations.js';
import { flushCoalescedWorkspaceSearchInvalidations } from './database/searchIndexInvalidationCoalescer.js';
import { stopSearchIndexInvalidationScheduler } from './database/searchIndexInvalidationScheduler.js';
import { installDevRendererReloadIntentWatcher } from './devRendererReloadIntent.js';
import { installDevRestartIntentWatcher } from './devRestartIntent.js';
import { stopDevScreenshotServer } from './devScreenshotServer.js';
import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';
import { installExternalDocumentFileOpenLifecycle } from './externalDocumentFileOpen.js';
import { notifyExternalSearchSecondInstance, notifyExternalSearchUserActivity, stopExternalSearchBackgroundRefresh } from './externalSearchBackgroundRefreshRuntime.js';
import { installGlobalCaptureToastOpenHandler } from './globalClipToastNavigation.js';
import { installGlobalClipToInboxShortcut } from './globalClipToInbox.js';
import { stopKeepImportMonitor } from './import/keepImportMonitor.js';
import { stopManagedInboxMonitor } from './import/managedInboxMonitor.js';
import { disposeAssistantCommandAdapter } from './ipc/assistantCommands.js';
import { appendBootEvent } from './ipc/boot.js';
import { installAppMenu } from './ipc/menu.js';
import { startInitialMainWindow } from './mainStartup.js';
import { installPairingFocusHandler, openOrCreateMainWindow, startCompanionSyncIfEnabled } from './mainWindowLifecycle.js';
import { getMainWindow, setMainWindow } from './mainWindowRegistry.js';
import { flushMirrorSync } from './mirror/mirrorSyncScheduler.js';
import type { StartupRendererView } from './rendererLoader.js';
import { bindEmbeddedLinkPanelContents, installMainRuntimeDiagnostics } from './runtimeMainSupport.js';
import type { RuntimeMode } from './runtimeMode.js';
import { loadStartupErrorSurface } from './startupErrorSurface.js';
import { isDesktopCompanionSyncEnabled } from './sync/desktopCompanionSyncPreference.js';
import { stopLanWorkspaceSyncServer } from './sync/lanWorkspaceSyncServer.js';

export interface MainLifecycleArgs {
  activateMainWindow: (window: BrowserWindow) => Promise<void>;
  createMainWindow: (startupAppearance?: { backgroundColor: string } | null) => Promise<BrowserWindow>;
  installInvokeHandler: () => void;
  loadMainWindow: (window: BrowserWindow, startupView?: StartupRendererView | null) => Promise<void>;
  prepareStartupAppearance?: () => { backgroundColor: string } | null;
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
    markAppQuittingForBackgroundPresence();
    devRestartIntentWatcher?.close();
    devRendererReloadIntentWatcher?.close();
    stopExternalSearchBackgroundRefresh();
    flushCoalescedWorkspaceSearchInvalidations();
    stopSearchIndexInvalidationScheduler();
    stopManagedInboxMonitor();
    stopKeepImportMonitor();
    disposeAssistantCommandAdapter();
    void stopDevScreenshotServer().catch((error) => appendMainProcessDiagnosticLog('dev_screenshot_stop_failed', { error }));
    void stopAgentControlApiServer().catch((error) => appendMainProcessDiagnosticLog('agent_control_stop_failed', { error }));
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

function installAppProcessDiagnostics() {
  installMainRuntimeDiagnostics();
  app.on('render-process-gone', (_, webContents, details) => appendMainProcessDiagnosticLog('render_process_gone', { ...details, url: webContents.getURL() }));
  app.on('child-process-gone', (_, details) => appendMainProcessDiagnosticLog('child_process_gone', { ...details }));
  app.on('web-contents-created', (_, contents) => bindEmbeddedLinkPanelContents(contents));
}

function installActivateLifecycle(openMainWindow: () => Promise<BrowserWindow | null>) {
  app.on('activate', async () => {
    notifyExternalSearchUserActivity();
    await openMainWindow();
  });
}

function startAgentControlApiLifecycle() {
  void (async () => {
    const status = await ensureAgentControlApiServer({ appVersion: resolveFolioleAppVersion(app) });
    if (status.state !== 'failed') return;
    appendMainProcessDiagnosticLog('agent_control_start_failed', {
      message: status.last_error ?? 'Agent Control API failed to start',
      state: status.state
    });
  })().catch((error) => {
    appendMainProcessDiagnosticLog('agent_control_start_failed', { error });
  });
}

export function installMainLifecycle(args: MainLifecycleArgs) {
  const externalDocumentFileOpen = installExternalDocumentFileOpenLifecycle();
  let startupMainWindowPromise: Promise<BrowserWindow> | null = null;
  const openMainWindow = () => {
    if (startupMainWindowPromise) {
      return startupMainWindowPromise.then((window) => {
        externalDocumentFileOpen.setReadyWindow(window);
        return window;
      });
    }
    return openOrCreateMainWindow(args, externalDocumentFileOpen.setReadyWindow);
  };
  installSingleInstanceGate(args.runtimeMode);
  installBeforeQuitLifecycle();
  app.on('second-instance', (_event, argv) => {
    void openMainWindow();
    externalDocumentFileOpen.enqueueFromArgv(argv);
    notifyExternalSearchSecondInstance();
  });
  app.whenReady().then(async () => {
    installAppProcessDiagnostics();
    args.installInvokeHandler();
    installGlobalClipToInboxShortcut();
    installGlobalCaptureToastOpenHandler();
    installBackgroundTray({
      getMainWindow,
      openMainWindow
    });
    await appendBootEvent('app_when_ready');
    startAgentControlApiLifecycle();
    beginDatabaseStartup();
    startupMainWindowPromise = (async () => {
      const mainWindow = await args.createMainWindow(args.prepareStartupAppearance?.() ?? null);
      setMainWindow(mainWindow);
      await startInitialMainWindow(args, {
        failDatabaseStartup: markDatabaseStartupFailed,
        initializeRuntimeServices,
        installPairingFocusHandler: () => installPairingFocusHandler(openMainWindow),
        loadStartupErrorSurface: (input) => loadStartupErrorSurface({ ...input, loadMainWindow: args.loadMainWindow }),
        mainWindow,
        startCompanionSyncIfEnabled: () => startCompanionSyncIfEnabled({
          appVersion: resolveFolioleAppVersion(app),
          isEnabled: isDesktopCompanionSyncEnabled,
          peerId: loadOrCreateDesktopDeviceId()
        })
      });
      externalDocumentFileOpen.setReadyWindow(mainWindow);
      return mainWindow;
    })();
    try {
      await startupMainWindowPromise;
    } finally {
      startupMainWindowPromise = null;
    }
    installActivateLifecycle(openMainWindow);
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && process.platform !== 'win32') app.quit();
  });
}
