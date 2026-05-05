import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { collectDesktopFailureDiagnostics, createMainProcessLogCollector, createRendererConsoleCollector } from './playwright-desktop-diagnostics.mjs';

const DEFAULT_TIMEOUT_MS = 30_000;
const WINDOWS_MIRROR_ROOT = '/mnt/c/dev/foliole';
export const APP_READY_FLAG = '__FOLIOLE_APP_READY_REPORTED__';

function resolveTimeoutMs(rawValue) {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

export function resolveDesktopAppRoot(env = process.env, existsSync = fs.existsSync) {
  const configuredRoot = env.FOLIOLE_ELECTRON_APP_ROOT?.trim();
  if (configuredRoot) {
    return path.resolve(configuredRoot);
  }
  if (existsSync(WINDOWS_MIRROR_ROOT)) {
    return WINDOWS_MIRROR_ROOT;
  }
  return process.cwd();
}

export function resolveDesktopLaunchTarget(appRoot, existsSync = fs.existsSync) {
  const resolvedAppRoot = path.resolve(appRoot);
  const mainEntry = path.join(resolvedAppRoot, 'electron-dist', 'electron', 'main.js');
  const preloadPath = path.join(resolvedAppRoot, 'electron', 'preload.cjs');
  const rendererIndexPath = path.join(resolvedAppRoot, 'dist', 'index.html');
  const requiredPaths = [mainEntry, preloadPath, rendererIndexPath];

  return {
    appRoot: resolvedAppRoot,
    launchMode: 'args',
    mainEntry,
    missingPaths: requiredPaths.filter((filePath) => !existsSync(filePath)),
    preloadPath,
    rendererIndexPath
  };
}

export function createDesktopLaunchOptions(target, timeoutMs, env = process.env) {
  const executablePath = env.FOLIOLE_ELECTRON_EXECUTABLE_PATH?.trim();

  return {
    args: [target.mainEntry],
    cwd: target.appRoot,
    env: {
      ...env,
      FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE: env.FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE?.trim() || '1'
    },
    executablePath: executablePath ? path.resolve(executablePath) : undefined,
    timeout: timeoutMs
  };
}

function getRemainingTimeout(deadline) {
  return Math.max(1, deadline - Date.now());
}

export async function acquireStableDesktopWindow(electronApp, timeoutMs) {
  const windowPage = await electronApp.firstWindow({ timeout: timeoutMs });

  await windowPage.waitForLoadState('domcontentloaded', { timeout: timeoutMs });
  await windowPage.waitForFunction(
    () =>
      globalThis.location.href !== 'about:blank' &&
      globalThis.document.readyState !== 'loading' &&
      Boolean(globalThis.document.getElementById('root')),
    undefined,
    { timeout: timeoutMs }
  );

  return windowPage;
}

async function acquireDesktopWindowWithConsole(electronApp, timeoutMs) {
  const windowPage = await electronApp.firstWindow({ timeout: timeoutMs });
  const rendererConsoleCollector = createRendererConsoleCollector(windowPage);

  try {
    await windowPage.waitForLoadState('domcontentloaded', { timeout: timeoutMs });
    await windowPage.waitForFunction(
      () =>
        globalThis.location.href !== 'about:blank' &&
        globalThis.document.readyState !== 'loading' &&
        Boolean(globalThis.document.getElementById('root')),
      undefined,
      { timeout: timeoutMs }
    );
    return { rendererConsoleCollector, windowPage };
  } catch (error) {
    rendererConsoleCollector.dispose();
    throw error;
  }
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

async function readMainProcessSnapshot(electronApp) {
  return electronApp.evaluate(({ app }) => ({
    appName: app.getName(),
    appPath: app.getAppPath(),
    isReady: app.isReady()
  }));
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
  timeoutMs = resolveTimeoutMs(
    env.FOLIOLE_ELECTRON_PLAYWRIGHT_TIMEOUT_MS ?? env.FOLIOLE_ELECTRON_SPIKE_TIMEOUT_MS
  )
} = {}) {
  const target = resolveDesktopLaunchTarget(appRoot, existsSync);
  if (target.missingPaths.length > 0) {
    throw new Error(`missing build output: ${target.missingPaths.join(', ')}`);
  }

  const launcher = electronLauncher ?? (await loadElectronLauncher());
  const launchOptions = createDesktopLaunchOptions(target, timeoutMs, env);
  const deadline = Date.now() + timeoutMs;
  const electronApp = await launcher.launch(launchOptions);
  const mainProcessCollector = createMainProcessLogCollector(electronApp.process());
  const { rendererConsoleCollector, windowPage: firstWindow } = await acquireDesktopWindowWithConsole(
    electronApp,
    getRemainingTimeout(deadline)
  );
  const appReady = await waitForDesktopAppReady(firstWindow, getRemainingTimeout(deadline));
  const snapshot = await readMainProcessSnapshot(electronApp);

  let closed = false;

  return {
    collectDiagnostics: () =>
      collectDesktopFailureDiagnostics({
        appRoot: target.appRoot,
        mainProcessCollector,
        rendererConsoleCollector,
        windowPage: firstWindow
      }),
    close: async () => {
      if (closed) {
        return;
      }
      closed = true;
      rendererConsoleCollector.dispose();
      mainProcessCollector.dispose();
      await electronApp.close();
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
