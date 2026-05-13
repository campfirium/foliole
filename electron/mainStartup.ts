import type { BrowserWindow } from 'electron';

import { registerAttachmentProtocol } from './attachments/attachmentProtocol.js';
import { registerRemoteImageProtocol } from './attachments/remoteImageProtocol.js';
import { startDevScreenshotServer } from './devScreenshotServer.js';
import { appendBootEvent } from './ipc/boot.js';
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
  loadStartupErrorSurface: (args: StartupErrorSurfaceArgs) => Promise<void>;
  mainWindow: BrowserWindow;
  startCompanionSyncIfEnabled: () => Promise<void>;
}

async function loadWorkspaceShell(args: {
  loadMainWindow: MainWindowStartupArgs['loadMainWindow'];
  window: BrowserWindow;
}) {
  await args.loadMainWindow(args.window);
  await appendBootEvent('main_window_shell_ready');
  await presentInitialRendererWindow(args.window);
}

export async function startInitialMainWindow(
  args: MainWindowStartupArgs,
  startup: InitialMainWindowStartupArgs
) {
  startDevScreenshotServer({ getWindow: () => startup.mainWindow });
  startup.installPairingFocusHandler();
  try {
    registerAttachmentProtocol();
    registerRemoteImageProtocol();
  } catch (error) {
    startup.failDatabaseStartup(error);
    await startup.loadStartupErrorSurface({ error, moduleLabel: 'Workspace shell', window: startup.mainWindow });
    return;
  }
  const [rendererResult, runtimeResult] = await Promise.allSettled([
    loadWorkspaceShell({ loadMainWindow: args.loadMainWindow, window: startup.mainWindow }),
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
    await startup.startCompanionSyncIfEnabled();
    await args.activateMainWindow(startup.mainWindow);
    await appendBootEvent('main_window_ready');
    startFollowupTasks();
  } catch (error) {
    await startup.loadStartupErrorSurface({ error, moduleLabel: 'Startup services', window: startup.mainWindow });
  }
}
