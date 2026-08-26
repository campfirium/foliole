import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  app,
  BrowserWindow,
  crashReporter,
  ipcMain,
  type BrowserWindow as ElectronBrowserWindow
} from 'electron';

import { registerAttachmentProtocolScheme } from './attachments/attachmentProtocol.js';
import { registerExtDocImageProtocolScheme } from './attachments/extDocImageProtocol.js';
import { registerRemoteImageProtocolScheme } from './attachments/remoteImageProtocol.js';
import { isAppQuittingForBackgroundPresence } from './backgroundPresence.js';
import { installMainWindowContentSecurityPolicy } from './contentSecurityPolicy.js';
import {
  resolveDesktopDeviceIdentityAcceptance,
  runDesktopDeviceIdentityAcceptance
} from './deviceIdentityAcceptance.js';
import { appendDiagnosticLog, parseDiagnosticLogPayload } from './diagnostics/diagnosticLog.js';
import { appendMainProcessDiagnosticLog, startLocalCrashReporter } from './diagnostics/mainProcessDiagnostics.js';
import { appendBootEvent } from './ipc/boot.js';
import { handleInvokeRequest } from './ipc/commands.js';
import {
  IPC_DIAGNOSTIC_LOG_CHANNEL,
  IPC_INVOKE_CHANNEL,
  IPC_WINDOW_RESIZED_EVENT_CHANNEL,
  type InvokeRequest
} from './ipc/contracts.js';
import { bindHotkeyRecorderInput } from './ipc/hotkeyRecorderInput.js';
import { bindMenuToWindow } from './ipc/menu.js';
import { installMainLifecycle } from './mainLifecycle.js';
import { prepareMainWindowStartupOptions } from './mainWindowStartupOptions.js';
import {
  bindWindowReadingProgressFlush,
  createWindowReadingProgressFlushOptions
} from './readingProgressWindowFlush.js';
import type { StartupRendererView } from './rendererLoader.js';
import {
  collectRuntimeDiagnosticsSnapshot,
  configureRuntimeAppIdentity,
  formatRuntimeDiagnosticsSnapshot
} from './runtimeIdentity.js';
import {
  activateMainWindowRenderer,
  bindMainWindowNavigationGuard,
  bindMainWindowWebviewAttachGuard,
  createMainWindowOptions,
  loadMainWindowRenderer,
  logWindowStateLifecycleEvent
} from './runtimeMainSupport.js';
import { resolveRuntimeMode } from './runtimeMode.js';
import { publishRuntimeSystemLanguage } from './runtimeSystemLanguage.js';
import { prepareStartupRendererAppearance } from './startupRendererPreparation.js';
import { desktopUpdateService } from './update/desktopUpdateRuntime.js';
import { bindWindowRuntimeDiagnostics, setStartupWindowPresentation } from './windowRuntimeDiagnostics.js';
import { bindWindowStatePersistence } from './windowStateLifecycle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const remoteDebuggingPort = process.env.FOLIOLE_REMOTE_DEBUGGING_PORT?.trim();
if (remoteDebuggingPort && /^\d{2,5}$/.test(remoteDebuggingPort)) {
  app.commandLine.appendSwitch('remote-debugging-port', remoteDebuggingPort);
}

if (process.env.FOLIOLE_DISABLE_HARDWARE_ACCELERATION === '1') {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.disableHardwareAcceleration();
  console.info('[electron-main] hardware acceleration disabled for this session');
}
const configuredIdentity = configureRuntimeAppIdentity(
  app,
  fs.mkdirSync.bind(fs),
  process.platform,
  process.env,
  process.argv,
  fs.rmSync.bind(fs)
);
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
registerExtDocImageProtocolScheme();
registerRemoteImageProtocolScheme();
startLocalCrashReporter(crashReporter, configuredIdentity.appName);
void appendBootEvent('main_process_start', {
  appName: configuredIdentity.appName,
  runtimeMode
}).catch((error) => {
  appendMainProcessDiagnosticLog('boot_log_failed', {
    error,
    stage: 'main_process_start'
  });
});

function bindWindowResizeEvents(window: ElectronBrowserWindow) {
  const publishResize = () => {
    window.webContents.send(IPC_WINDOW_RESIZED_EVENT_CHANNEL);
  };

  window.on('maximize', publishResize);
  window.on('restore', publishResize);
  window.on('show', publishResize);
  window.on('unmaximize', publishResize);
  window.on('resize', publishResize);
}

async function loadRendererIntoWindow(
  window: ElectronBrowserWindow,
  startupView?: StartupRendererView | null
) {
  await appendBootEvent('renderer_load_start', {
    startupView: startupView?.kind ?? 'workspace'
  });
  await loadMainWindowRenderer({
    runtimeDiagnostics,
    runtimeDir: __dirname,
    ...(startupView === undefined ? {} : { startupView }),
    window
  });
  await appendBootEvent('renderer_load_complete', {
    startupView: startupView?.kind ?? 'workspace',
    url: window.webContents.getURL()
  });
}

async function activateRendererInWindow(window: ElectronBrowserWindow) {
  await appendBootEvent('renderer_activation_start');
  await activateMainWindowRenderer(window);
  await appendBootEvent('renderer_activation_complete');
}

async function createMainWindow(
  startupAppearance?: { backgroundColor: string; displayScalePercent?: number } | null,
  startupOptions: { deferDatabaseBackedBindings?: boolean } = {}
) {
  publishRuntimeSystemLanguage(app);
  const { options, restoredWindowState } = await prepareMainWindowStartupOptions(
    createMainWindowOptions(runtimeDiagnostics.preloadPath),
    startupAppearance,
    startupOptions.deferDatabaseBackedBindings === true
  );
  const window = new BrowserWindow(options);
  installMainWindowContentSecurityPolicy(window.webContents.session, { isPackaged: app.isPackaged });
  bindMainWindowNavigationGuard(window, startupAppearance?.displayScalePercent ?? 100);
  bindMainWindowWebviewAttachGuard(window);
  await appendBootEvent('browser_window_created', {
    bounds: window.getBounds(),
    show: window.isVisible()
  });
  logWindowStateLifecycleEvent('window-created', window);
  setStartupWindowPresentation(window, {
    isFullScreen: restoredWindowState?.isFullScreen === true,
    isMaximized: restoredWindowState?.isMaximized === true
  });
  await appendBootEvent('startup_window_presentation_prepared', {
    bounds: window.getBounds(),
    isFullScreen: window.isFullScreen(),
    isMaximized: window.isMaximized(),
    show: window.isVisible()
  });
  bindWindowResizeEvents(window);
  bindHotkeyRecorderInput(window);
  if (!startupOptions.deferDatabaseBackedBindings) {
    bindWindowReadingProgressFlush(
      window,
      createWindowReadingProgressFlushOptions(process.platform, isAppQuittingForBackgroundPresence)
    );
    bindWindowStatePersistence(window);
  }
  bindMenuToWindow(window);
  bindWindowRuntimeDiagnostics(window);
  return window;
}

function installInvokeHandler() {
  ipcMain.handle(IPC_DIAGNOSTIC_LOG_CHANNEL, async (_event, payload: unknown) => {
    await appendDiagnosticLog(parseDiagnosticLogPayload(payload));
  });
  ipcMain.handle(IPC_INVOKE_CHANNEL, async (event, request: InvokeRequest) =>
    handleInvokeRequest(request, { sender: event.sender })
  );
}

const deviceIdentityAcceptance = resolveDesktopDeviceIdentityAcceptance();
if (deviceIdentityAcceptance) {
  void app.whenReady().then(() => runDesktopDeviceIdentityAcceptance(app, deviceIdentityAcceptance));
} else {
  void app.whenReady().then(() => desktopUpdateService.start());
  installMainLifecycle({
    activateMainWindow: activateRendererInWindow,
    createMainWindow,
    installInvokeHandler,
    loadMainWindow: loadRendererIntoWindow,
    prepareStartupAppearance: () => prepareStartupRendererAppearance(__dirname, configuredIdentity.userDataPath),
    runtimeMode
  });
}
