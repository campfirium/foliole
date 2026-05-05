/* global console */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_TIMEOUT_MS = 30_000;
const WINDOWS_MIRROR_ROOT = '/mnt/c/dev/foliole';
let cliFailureReported = false;

function resolveTimeoutMs(rawValue) {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

export function resolveDefaultAppRoot(env = process.env, existsSync = fs.existsSync) {
  const configuredRoot = env.FOLIOLE_ELECTRON_APP_ROOT?.trim();
  if (configuredRoot) {
    return path.resolve(configuredRoot);
  }
  if (existsSync(WINDOWS_MIRROR_ROOT)) {
    return WINDOWS_MIRROR_ROOT;
  }
  return process.cwd();
}

export function resolveElectronSpikeTarget(appRoot, existsSync = fs.existsSync) {
  const resolvedAppRoot = path.resolve(appRoot);
  const mainEntry = path.join(resolvedAppRoot, 'electron-dist', 'electron', 'main.js');
  const preloadPath = path.join(resolvedAppRoot, 'electron-dist', 'preload.cjs');
  const rendererIndexPath = path.join(resolvedAppRoot, 'dist', 'index.html');
  const requiredPaths = [mainEntry, preloadPath, rendererIndexPath];

  return {
    appRoot: resolvedAppRoot,
    launchMode: 'args',
    mainEntry,
    preloadPath,
    rendererIndexPath,
    missingPaths: requiredPaths.filter((filePath) => !existsSync(filePath))
  };
}

function createLaunchOptions(target, timeoutMs, env) {
  const executablePath = env.FOLIOLE_ELECTRON_EXECUTABLE_PATH?.trim();

  return {
    args: [target.mainEntry],
    cwd: target.appRoot,
    timeout: timeoutMs,
    executablePath: executablePath ? path.resolve(executablePath) : undefined
  };
}

async function readMainProcessSnapshot(electronApp) {
  return electronApp.evaluate(({ app }) => ({
    appName: app.getName(),
    appPath: app.getAppPath(),
    isReady: app.isReady()
  }));
}

export async function runElectronLaunchSpike({
  appRoot = resolveDefaultAppRoot(),
  env = process.env,
  existsSync = fs.existsSync,
  electronLauncher,
  timeoutMs = resolveTimeoutMs(env.FOLIOLE_ELECTRON_SPIKE_TIMEOUT_MS)
}) {
  const target = resolveElectronSpikeTarget(appRoot, existsSync);
  if (target.missingPaths.length > 0) {
    throw new Error(`missing build output: ${target.missingPaths.join(', ')}`);
  }

  const launchOptions = createLaunchOptions(target, timeoutMs, env);
  const electronApp = await electronLauncher.launch(launchOptions);

  try {
    const firstWindow = await electronApp.firstWindow({ timeout: timeoutMs });
    const snapshot = await readMainProcessSnapshot(electronApp);

    return {
      appName: snapshot.appName,
      appPath: snapshot.appPath,
      appReady: snapshot.isReady,
      appRoot: target.appRoot,
      executablePath: launchOptions.executablePath ?? null,
      firstWindowTitle: await firstWindow.title(),
      firstWindowUrl: firstWindow.url(),
      launchMode: target.launchMode,
      mainEntry: target.mainEntry,
      preloadPath: target.preloadPath,
      processPid: electronApp.process()?.pid ?? null,
      rendererIndexPath: target.rendererIndexPath,
      timeoutMs
    };
  } finally {
    await electronApp.close();
  }
}

function isCliEntry() {
  const entryArg = process.argv[1];
  if (!entryArg) {
    return false;
  }
  return import.meta.url === pathToFileURL(path.resolve(entryArg)).href;
}

function reportCliFailure(targetRoot, error) {
  if (cliFailureReported) {
    return;
  }
  cliFailureReported = true;

  const details = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify(
      {
        status: 'failed',
        appRoot: targetRoot,
        launchMode: 'args',
        error: details
      },
      null,
      2
    )
  );
}

async function main() {
  const targetRoot = resolveDefaultAppRoot();
  process.on('unhandledRejection', (error) => {
    reportCliFailure(targetRoot, error);
    process.exit(1);
  });
  process.on('uncaughtException', (error) => {
    reportCliFailure(targetRoot, error);
    process.exit(1);
  });

  try {
    const { _electron: electronLauncher } = await import('playwright');
    const result = await runElectronLaunchSpike({
      appRoot: targetRoot,
      electronLauncher
    });
    console.log(JSON.stringify({ status: 'ok', ...result }, null, 2));
  } catch (error) {
    reportCliFailure(targetRoot, error);
    process.exitCode = 1;
  }
}

if (isCliEntry()) {
  await main();
}
