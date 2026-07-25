import { app, BrowserWindow } from 'electron';

import { stopAgentControlApiServer } from './agentControl/agentControlServer.js';
import { resolveFolioleAppVersion } from './appVersion.js';
import { markAppQuittingForBackgroundPresence } from './backgroundPresence.js';
import { createBeforeQuitCoordinator } from './beforeQuitCoordinator.js';
import { beginDatabaseStartup, markDatabaseReady, markDatabaseStartupFailed } from './database/databaseReadiness.js';
import { loadOrCreateDesktopDeviceId } from './database/deviceIdentity.js';
import { initializeDatabase } from './database/migrate.js';
import { flushCoalescedWorkspaceSearchInvalidations } from './database/searchIndexInvalidationCoalescer.js';
import { stopSearchIndexInvalidationScheduler } from './database/searchIndexInvalidationScheduler.js';
import { restoreDesktopSecurityScopedAccess, stopDesktopSecurityScopedAccess } from './desktopSecurityScopedAccess.js';
import { installDevRendererReloadIntentWatcher } from './devRendererReloadIntent.js';
import { installDevRestartIntentWatcher } from './devRestartIntent.js';
import { stopDevScreenshotServer } from './devScreenshotServer.js';
import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';
import { installExternalDocumentFileOpenLifecycle } from './externalDocumentFileOpen.js';
import { notifyExternalSearchSecondInstance, notifyExternalSearchUserActivity, stopExternalSearchBackgroundRefresh } from './externalSearchBackgroundRefreshRuntime.js';
import {
  refreshGlobalClipShortcutFromSettings
} from './globalClipShortcut.js';
import { prepareGlobalClipToInboxWindows } from './globalClipToInbox.js';
import { stopKeepImportMonitor } from './import/keepImportMonitor.js';
import { stopManagedInboxMonitor } from './import/managedInboxMonitor.js';
import {
  initializeRuntimeServicesAfterLibrarySetup,
  prepareInitialLibrarySetup,
  quitIfInitialLibrarySetupIsAbandoned,
  type InitialLibrarySetupPreparation
} from './initialLibrarySetup.js';
import { disposeAssistantCommandAdapter } from './ipc/assistantCommands.js';
import { appendBootEvent } from './ipc/boot.js';
import { installAppMenu } from './ipc/menu.js';
import { wasOpenedAtLogin } from './loginItemSettings.js';
import { installMacosDailyDebugExitHandler } from './macosDailyDebugExit.js';
import { installDatabaseBackedEntryPoints } from './mainDatabaseBackedEntryPoints.js';
import { startInitialMainWindow } from './mainStartup.js';
import { installPairingFocusHandler, openOrCreateMainWindow, startCompanionSyncIfEnabled } from './mainWindowLifecycle.js';
import { setMainWindow } from './mainWindowRegistry.js';
import { flushMirrorSync } from './mirror/mirrorSyncScheduler.js';
import type { StartupRendererView } from './rendererLoader.js';
import { bindEmbeddedLinkPanelContents, installMainRuntimeDiagnostics } from './runtimeMainSupport.js';
import type { RuntimeMode } from './runtimeMode.js';
import { loadStartupErrorSurface } from './startupErrorSurface.js';
import type { StartupRendererAppearance } from './startupRendererPreparation.js';
import { isDesktopCompanionSyncEnabled } from './sync/desktopCompanionSyncPreference.js';
import { stopLanWorkspaceSyncServer } from './sync/lanWorkspaceSyncServer.js';

export interface MainLifecycleArgs {
  activateMainWindow: (window: BrowserWindow) => Promise<void>;
  createMainWindow: (
    startupAppearance?: StartupRendererAppearance | null,
    options?: { deferDatabaseBackedBindings?: boolean }
  ) => Promise<BrowserWindow>;
  installInvokeHandler: () => void;
  loadMainWindow: (window: BrowserWindow, startupView?: StartupRendererView | null) => Promise<void>;
  prepareStartupAppearance?: () => StartupRendererAppearance | null;
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
  installMacosDailyDebugExitHandler({ app, getWindows: () => BrowserWindow.getAllWindows() });
  const devRestartIntentWatcher = installDevRestartIntentWatcher({ app, getWindows: () => BrowserWindow.getAllWindows() });
  const devRendererReloadIntentWatcher = installDevRendererReloadIntentWatcher({ getWindows: () => BrowserWindow.getAllWindows() });
  const coordinateBeforeQuit = createBeforeQuitCoordinator({
    flush: flushMirrorSync,
    onFlushError: (error) => appendMainProcessDiagnosticLog('mirror_flush_on_quit_failed', { error }),
    quit: () => app.quit()
  });
  app.on('before-quit', (event) => {
    markAppQuittingForBackgroundPresence();
    devRestartIntentWatcher?.close();
    devRendererReloadIntentWatcher?.close();
    stopExternalSearchBackgroundRefresh();
    flushCoalescedWorkspaceSearchInvalidations();
    stopSearchIndexInvalidationScheduler();
    stopManagedInboxMonitor();
    stopKeepImportMonitor();
    stopDesktopSecurityScopedAccess();
    disposeAssistantCommandAdapter();
    void stopDevScreenshotServer().catch((error) => appendMainProcessDiagnosticLog('dev_screenshot_stop_failed', { error }));
    void stopAgentControlApiServer().catch((error) => appendMainProcessDiagnosticLog('agent_control_stop_failed', { error }));
    void stopLanWorkspaceSyncServer().catch((error) => appendMainProcessDiagnosticLog('lan_sync_stop_failed', { error }));
    coordinateBeforeQuit(event);
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
    refreshGlobalClipShortcutFromSettings();
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

function installWindowAllClosedLifecycle() {
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && process.platform !== 'win32') app.quit();
  });
}

async function prepareGlobalClipAfterStartup(startupMainWindow: Promise<BrowserWindow>) {
  await startupMainWindow;
  prepareGlobalClipToInboxWindows();
}

function createStartupMainWindow(
  args: MainLifecycleArgs,
  appearance: { backgroundColor: string } | null,
  setup: InitialLibrarySetupPreparation | null
) {
  return setup
    ? args.createMainWindow(appearance, { deferDatabaseBackedBindings: true })
    : args.createMainWindow(appearance);
}

export function installMainLifecycle(args: MainLifecycleArgs) {
  const externalDocumentFileOpen = installExternalDocumentFileOpenLifecycle();
  let startupMainWindowPromise: Promise<BrowserWindow> | null = null;
  const openMainWindow = () => {
    if (startupMainWindowPromise) {
      const pendingWindow = startupMainWindowPromise;
      return pendingWindow.then(() => openOrCreateMainWindow(args, externalDocumentFileOpen.setReadyWindow));
    }
    return openOrCreateMainWindow(args, externalDocumentFileOpen.setReadyWindow);
  };
  installSingleInstanceGate(args.runtimeMode);
  installBeforeQuitLifecycle();
  installActivateLifecycle(openMainWindow);
  app.on('second-instance', (_event, argv) => {
    void openMainWindow();
    externalDocumentFileOpen.enqueueFromArgv(argv);
    notifyExternalSearchSecondInstance();
  });
  app.whenReady().then(async () => {
    restoreDesktopSecurityScopedAccess();
    installAppProcessDiagnostics();
    args.installInvokeHandler();
    await appendBootEvent('app_when_ready');
    const initialLibrarySetup = prepareInitialLibrarySetup();
    beginDatabaseStartup();
    startupMainWindowPromise = (async () => {
      const startupAppearance = args.prepareStartupAppearance?.() ?? null;
      const mainWindow = await createStartupMainWindow(args, startupAppearance, initialLibrarySetup);
      quitIfInitialLibrarySetupIsAbandoned(initialLibrarySetup, mainWindow);
      setMainWindow(mainWindow);
      await startInitialMainWindow(args, {
        failDatabaseStartup: markDatabaseStartupFailed,
        initializeRuntimeServices: () => initializeRuntimeServicesAfterLibrarySetup(
          initialLibrarySetup,
          initializeRuntimeServices,
          () => installDatabaseBackedEntryPoints(openMainWindow)
        ),
        ...(initialLibrarySetup ? { initialStartupView: initialLibrarySetup.startupView } : {}),
        installPairingFocusHandler: () => installPairingFocusHandler(openMainWindow),
        loadStartupErrorSurface: (input) => loadStartupErrorSurface({ ...input, loadMainWindow: args.loadMainWindow }),
        mainWindow,
        showInitialWindow: !wasOpenedAtLogin(),
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
      await prepareGlobalClipAfterStartup(startupMainWindowPromise);
    } finally {
      startupMainWindowPromise = null;
    }
  });
  installWindowAllClosedLifecycle();
}
