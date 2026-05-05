/* global console */

import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  launchDesktopSession,
  resolveDesktopAppRoot,
  resolveDesktopLaunchTarget
} from './playwright-desktop-harness.mjs';

let cliFailureReported = false;

export const resolveDefaultAppRoot = resolveDesktopAppRoot;
export const resolveElectronSpikeTarget = resolveDesktopLaunchTarget;

export async function runElectronLaunchSpike({
  appRoot = resolveDefaultAppRoot(),
  env = process.env,
  existsSync,
  electronLauncher,
  timeoutMs
}) {
  const session = await launchDesktopSession({
    appRoot,
    electronLauncher,
    env,
    existsSync,
    timeoutMs
  });

  try {
    return {
      appName: session.snapshot.appName,
      appPath: session.snapshot.appPath,
      appReady: session.snapshot.isReady,
      appRoot: session.target.appRoot,
      executablePath: session.launchOptions.executablePath ?? null,
      firstWindowTitle: await session.firstWindow.title(),
      firstWindowUrl: session.firstWindow.url(),
      launchMode: session.target.launchMode,
      mainEntry: session.target.mainEntry,
      preloadPath: session.target.preloadPath,
      processPid: session.electronApp.process()?.pid ?? null,
      rendererIndexPath: session.target.rendererIndexPath,
      timeoutMs: session.timeoutMs
    };
  } finally {
    await session.close();
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
