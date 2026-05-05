import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_TIMEOUT_MS = 30_000;
const WINDOWS_MIRROR_ROOT = '/mnt/c/dev/foliole';

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
  const preloadPath = path.join(resolvedAppRoot, 'electron-dist', 'preload.cjs');
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
    executablePath: executablePath ? path.resolve(executablePath) : undefined,
    timeout: timeoutMs
  };
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
  const electronApp = await launcher.launch(launchOptions);
  const firstWindow = await electronApp.firstWindow({ timeout: timeoutMs });
  const snapshot = await readMainProcessSnapshot(electronApp);

  let closed = false;

  return {
    close: async () => {
      if (closed) {
        return;
      }
      closed = true;
      await electronApp.close();
    },
    electronApp,
    firstWindow,
    launchOptions,
    snapshot,
    target,
    timeoutMs
  };
}
