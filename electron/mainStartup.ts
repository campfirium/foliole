import path from 'node:path';

import type { BrowserWindow } from 'electron';

import { registerAttachmentProtocol } from './attachments/attachmentProtocol.js';
import { registerExtDocImageProtocol } from './attachments/extDocImageProtocol.js';
import { configureRemoteImagePipelineCacheRoot } from './attachments/remoteImagePipeline.js';
import { registerRemoteImageProtocol } from './attachments/remoteImageProtocol.js';
import { startDevScreenshotServer } from './devScreenshotServer.js';
import { appendBootEvent, waitForRendererAppReady } from './ipc/boot.js';
import { resolveAppPaths } from './ipc/paths.js';
import { startFollowupTasks } from './mainFollowupTasks.js';
import type { StartupRendererView } from './rendererLoader.js';
import { presentInitialRendererWindow } from './windowRuntimeDiagnostics.js';

interface MainWindowStartupArgs {
  activateMainWindow: (window: BrowserWindow) => Promise<void>;
  loadMainWindow: (window: BrowserWindow, startupView?: StartupRendererView | null) => Promise<void>;
}

interface StartupErrorSurfaceArgs {
  error: unknown;
  moduleLabel: string;
  window: BrowserWindow;
}

interface InitialMainWindowStartupArgs {
  failDatabaseStartup: (error: unknown) => void;
  initializeRuntimeServices: () => Promise<void>;
  installPairingFocusHandler: () => void;
  initialStartupView?: StartupRendererView | null;
  loadStartupErrorSurface: (args: StartupErrorSurfaceArgs) => Promise<void>;
  mainWindow: BrowserWindow;
  showInitialWindow?: boolean;
  startCompanionSyncIfEnabled: () => Promise<void>;
}

const STARTUP_SHELL_READY_TIMEOUT_MS = 2500;

async function waitForRendererShellReady(window: BrowserWindow, rendererLoadPromise: Promise<void>) {
  if (typeof window.once !== 'function') {
    await rendererLoadPromise.catch(() => undefined);
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      window.off('ready-to-show', finish);
      resolve();
    };
    const timeout = globalThis.setTimeout(finish, STARTUP_SHELL_READY_TIMEOUT_MS);
    window.once('ready-to-show', finish);
    void rendererLoadPromise.then(finish, finish);
  });
}

async function loadWorkspaceShell(args: {
  loadMainWindow: MainWindowStartupArgs['loadMainWindow'];
  showInitialWindow: boolean;
  startupView?: StartupRendererView | null;
  window: BrowserWindow;
}) {
  const rendererLoadPromise = args.startupView === undefined
    ? args.loadMainWindow(args.window)
    : args.loadMainWindow(args.window, args.startupView);
  await waitForRendererShellReady(args.window, rendererLoadPromise);
  await appendBootEvent('main_window_shell_ready');
  await presentInitialRendererWindow(args.window, { show: args.showInitialWindow });
  await rendererLoadPromise;
}

export async function startInitialMainWindow(
  args: MainWindowStartupArgs,
  startup: InitialMainWindowStartupArgs
) {
  startDevScreenshotServer({ getWindow: () => startup.mainWindow });
  startup.installPairingFocusHandler();
  try {
    configureRemoteImagePipelineCacheRoot(path.join(resolveAppPaths().app_cache_dir, 'remote-images'));
    registerAttachmentProtocol();
    registerExtDocImageProtocol();
    registerRemoteImageProtocol();
  } catch (error) {
    startup.failDatabaseStartup(error);
    await startup.loadStartupErrorSurface({ error, moduleLabel: 'Workspace shell', window: startup.mainWindow });
    return;
  }
  const [rendererResult, runtimeResult] = await Promise.allSettled([
    loadWorkspaceShell({
      loadMainWindow: args.loadMainWindow,
      showInitialWindow: startup.showInitialWindow !== false,
      ...(startup.initialStartupView === undefined ? {} : { startupView: startup.initialStartupView }),
      window: startup.mainWindow
    }),
    startup.initializeRuntimeServices()
  ]);
  if (rendererResult.status === 'rejected') {
    await startup.loadStartupErrorSurface({ error: rendererResult.reason, moduleLabel: 'Workspace shell', window: startup.mainWindow });
    return;
  }
  if (runtimeResult.status === 'rejected') {
    await startup.loadStartupErrorSurface({ error: runtimeResult.reason, moduleLabel: 'Database migration', window: startup.mainWindow });
    return;
  }
  try {
    if (startup.initialStartupView?.kind === 'library-setup') {
      await args.loadMainWindow(startup.mainWindow, null);
    }
    await startup.startCompanionSyncIfEnabled();
    await args.activateMainWindow(startup.mainWindow);
    await appendBootEvent('main_window_ready');
    await waitForRendererAppReady();
    startFollowupTasks();
  } catch (error) {
    await startup.loadStartupErrorSurface({ error, moduleLabel: 'Startup services', window: startup.mainWindow });
  }
}
