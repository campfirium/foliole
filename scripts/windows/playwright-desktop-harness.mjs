import fs from 'node:fs';
import process from 'node:process';

import {
  collectDesktopFailureDiagnostics,
  createMainProcessLogCollector,
  createRendererConsoleCollector,
  createRendererPageEventCollector
} from './playwright-desktop-diagnostics.mjs';
import {
  createDesktopLaunchOptions,
  resolveDesktopAppRoot,
  resolveDesktopLaunchTarget
} from './playwright-desktop-launch-target.mjs';
import { createDesktopIsolationContext } from './playwright-desktop-isolation.mjs';
import { assertRendererDistFresh } from './playwright-renderer-dist-freshness.mjs';
import { waitForDesktopRootWindow } from './playwright-desktop-window.mjs';

const DEFAULT_TIMEOUT_MS = 120_000;
export const APP_READY_FLAG = '__FOLIOLE_APP_READY_REPORTED__';
export {
  createDesktopLaunchOptions,
  resolveDesktopAppRoot,
  resolveDesktopLaunchTarget,
  resolveElectronExecutablePath
} from './playwright-desktop-launch-target.mjs';

function resolveTimeoutMs(rawValue) {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

function getRemainingTimeout(deadline) {
  return Math.max(1, deadline - Date.now());
}

function isContextResetError(error) {
  return error instanceof Error && error.message.includes('Execution context was destroyed');
}

export async function acquireStableDesktopWindow(electronApp, timeoutMs) {
  return waitForDesktopRootWindow(electronApp, timeoutMs);
}

async function acquireDesktopWindowWithConsole(electronApp, timeoutMs) {
  const windowPage = await waitForDesktopRootWindow(electronApp, timeoutMs);
  const rendererConsoleCollector = createRendererConsoleCollector(windowPage);
  const rendererPageEventCollector = createRendererPageEventCollector(windowPage);

  try {
    return { rendererConsoleCollector, rendererPageEventCollector, windowPage };
  } catch (error) {
    error.rendererCollectors = {
      rendererConsoleCollector,
      rendererPageEventCollector,
      windowPage
    };
    throw error;
  }
}

async function enrichDesktopLaunchError({
  appRoot,
  stateRoot,
  error,
  mainProcessCollector
}) {
  const collectors = error?.rendererCollectors;
  if (!collectors?.windowPage) {
    return error;
  }
  try {
    error.desktopDiagnostics = await collectDesktopFailureDiagnostics({
      appRoot,
      stateRoot,
      mainProcessCollector,
      rendererConsoleCollector: collectors.rendererConsoleCollector,
      rendererPageEventCollector: collectors.rendererPageEventCollector,
      windowPage: collectors.windowPage
    });
  } catch (diagnosticsError) {
    error.desktopDiagnostics = {
      collectedAt: new Date().toISOString(),
      error: diagnosticsError instanceof Error ? diagnosticsError.message : String(diagnosticsError)
    };
  }
  return error;
}

export async function waitForDesktopAppReady(windowPage, timeoutMs) {
  await windowPage.waitForFunction((appReadyFlag) => globalThis[appReadyFlag] === true, APP_READY_FLAG, {
    timeout: timeoutMs
  });

  return windowPage.evaluate((appReadyFlag) => ({
    href: globalThis.location.href,
    readyState: globalThis.document.readyState,
    reported: globalThis[appReadyFlag] === true
  }), APP_READY_FLAG);
}

async function readMainProcessSnapshot(electronApp, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await electronApp.evaluate(({ app }) => ({
        appName: app.getName(),
        appPath: app.getAppPath(),
        isReady: app.isReady()
      }));
    } catch (error) {
      if (!isContextResetError(error)) throw error;
      lastError = error;
      await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
    }
  }
  throw lastError ?? new Error('main process snapshot timed out');
}

export async function loadElectronLauncher() {
  const { _electron: electronLauncher } = await import('playwright');
  return electronLauncher;
}

export async function launchDesktopSession({
  appRoot = resolveDesktopAppRoot(),
  electronLauncher = undefined,
  env = process.env,
  existsSync = fs.existsSync,
  extraArgs = [],
  timeoutMs = resolveTimeoutMs(
    env.FOLIOLE_ELECTRON_PLAYWRIGHT_TIMEOUT_MS ?? env.FOLIOLE_ELECTRON_SPIKE_TIMEOUT_MS
  )
} = {}) {
  const target = resolveDesktopLaunchTarget(appRoot, existsSync);
  if (target.missingPaths.length > 0) {
    throw new Error(`missing build output: ${target.missingPaths.join(', ')}`);
  }
  assertRendererDistFresh(target, env);

  const launcher = electronLauncher ?? (await loadElectronLauncher());
  const isolation = createDesktopIsolationContext(env);
  target.runtimeStateRoot = isolation.runtimeStateRoot;
  const launchOptions = createDesktopLaunchOptions(target, timeoutMs, env, isolation, existsSync, extraArgs);
  const deadline = Date.now() + timeoutMs;
  let electronApp;
  try {
    electronApp = await launcher.launch(launchOptions);
  } catch (error) {
    isolation.cleanup();
    throw error;
  }
  const mainProcessCollector = createMainProcessLogCollector(electronApp.process());
  let rendererConsoleCollector;
  let rendererPageEventCollector;
  let firstWindow;
  let appReady;
  let snapshot;
  try {
    ({
      rendererConsoleCollector,
      rendererPageEventCollector,
      windowPage: firstWindow
    } = await acquireDesktopWindowWithConsole(electronApp, getRemainingTimeout(deadline)));
    appReady = await waitForDesktopAppReady(firstWindow, getRemainingTimeout(deadline));
    snapshot = await readMainProcessSnapshot(electronApp, getRemainingTimeout(deadline));
  } catch (error) {
    await enrichDesktopLaunchError({
      appRoot: target.appRoot,
      stateRoot: target.runtimeStateRoot,
      error,
      mainProcessCollector
    });
    mainProcessCollector.dispose();
    const failureCollectors = error?.rendererCollectors;
    (failureCollectors?.rendererConsoleCollector ?? rendererConsoleCollector)?.dispose?.();
    (failureCollectors?.rendererPageEventCollector ?? rendererPageEventCollector)?.dispose?.();
    await electronApp.close();
    isolation.cleanup();
    throw error;
  }

  let closed = false;

  return {
    collectDiagnostics: () =>
      collectDesktopFailureDiagnostics({
        appRoot: target.appRoot,
        stateRoot: target.runtimeStateRoot,
        mainProcessCollector,
        rendererPageEventCollector,
        rendererConsoleCollector,
        windowPage: firstWindow
      }),
    close: async () => {
      if (closed) {
        return;
      }
      closed = true;
      rendererConsoleCollector.dispose();
      rendererPageEventCollector.dispose();
      mainProcessCollector.dispose();
      await electronApp.close();
      isolation.cleanup();
    },
    appReady,
    electronApp,
    firstWindow,
    launchOptions,
    snapshot,
    target,
    timeoutMs
  };
}
