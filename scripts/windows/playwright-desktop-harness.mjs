import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  collectDesktopFailureDiagnostics,
  createMainProcessLogCollector,
  createRendererConsoleCollector,
  createRendererPageEventCollector
} from './playwright-desktop-diagnostics.mjs';
import { createDesktopIsolationContext } from './playwright-desktop-isolation.mjs';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_WINDOWS_WORKDIR = 'C:\\dev\\foliole';
export const APP_READY_FLAG = '__FOLIOLE_APP_READY_REPORTED__';

function resolveTimeoutMs(rawValue) {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

function resolveConfiguredWindowsWorkdir(env = process.env) {
  const configuredWorkdir = env.FOLIOLE_WINDOWS_WORKDIR?.trim() || env.WINDOWS_WORKDIR?.trim();
  if (configuredWorkdir) {
    return path.win32.resolve(configuredWorkdir);
  }
  return DEFAULT_WINDOWS_WORKDIR;
}

function resolveWslMirrorRoot(windowsWorkdir) {
  const normalized = windowsWorkdir.replace(/\\/g, '/');
  const driveMatch = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (!driveMatch) {
    return path.posix.resolve(normalized);
  }

  const [, driveLetter, remainder] = driveMatch;
  return path.posix.join('/mnt', driveLetter.toLowerCase(), remainder);
}

export function resolveDesktopAppRoot(env = process.env) {
  const configuredRoot = env.FOLIOLE_ELECTRON_APP_ROOT?.trim();
  if (configuredRoot) {
    return path.resolve(configuredRoot);
  }

  const windowsWorkdir = resolveConfiguredWindowsWorkdir(env);
  if (process.platform === 'win32') {
    return windowsWorkdir;
  }
  return resolveWslMirrorRoot(windowsWorkdir);
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

export function createDesktopLaunchOptions(
  target,
  timeoutMs,
  env = process.env,
  isolation = createDesktopIsolationContext(env),
  existsSync = fs.existsSync
) {
  const executablePath = resolveElectronExecutablePath(target.appRoot, env, existsSync);
  const launchEnv = {
    ...env,
    ...isolation.env,
    FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE: env.FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE?.trim() || '1'
  };
  delete launchEnv.ELECTRON_RUN_AS_NODE;

  return {
    args: [target.mainEntry],
    cwd: target.appRoot,
    env: launchEnv,
    executablePath: executablePath ? path.resolve(executablePath) : undefined,
    timeout: timeoutMs
  };
}

export function resolveElectronExecutablePath(
  appRoot,
  env = process.env,
  existsSync = fs.existsSync
) {
  const configuredPath = env.FOLIOLE_ELECTRON_EXECUTABLE_PATH?.trim();
  if (configuredPath) {
    return path.resolve(configuredPath);
  }

  const resolvedAppRoot = path.resolve(appRoot);
  const candidatePaths = [
    path.join(resolvedAppRoot, 'node_modules', 'electron', 'dist', 'electron.exe'),
    path.join(resolvedAppRoot, 'node_modules', 'electron', 'dist', 'electron')
  ];

  return candidatePaths.find((candidatePath) => existsSync(candidatePath));
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
  const rendererPageEventCollector = createRendererPageEventCollector(windowPage);

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
  const isolation = createDesktopIsolationContext(env);
  target.runtimeStateRoot = isolation.runtimeStateRoot;
  const launchOptions = createDesktopLaunchOptions(target, timeoutMs, env, isolation, existsSync);
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
    snapshot = await readMainProcessSnapshot(electronApp);
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
