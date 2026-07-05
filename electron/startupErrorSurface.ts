import type { BrowserWindow } from 'electron';

import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';
import { appendBootEvent } from './ipc/boot.js';
import { resolveAppPaths } from './ipc/paths.js';
import type { StartupRendererView } from './rendererLoader.js';

type LoadMainWindow = (window: BrowserWindow, startupView?: StartupRendererView | null) => Promise<void>;

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

export async function loadStartupErrorSurface(args: {
  error: unknown;
  loadMainWindow: LoadMainWindow;
  moduleLabel: string;
  window: BrowserWindow;
}) {
  await reportStartupRuntimeServicesFailure(args.error, args.moduleLabel);
  if (!args.window.isDestroyed()) {
    await args.loadMainWindow(args.window, createStartupErrorView(args.error, args.moduleLabel));
    if (!args.window.isVisible()) {
      args.window.show();
    }
  }
}
