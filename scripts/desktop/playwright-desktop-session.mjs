import fs from 'node:fs';
import process from 'node:process';

import { closeDesktopApplication } from './playwright-desktop-close.mjs';
import { createDesktopIsolationContext } from './playwright-desktop-isolation.mjs';
import {
  createDesktopLaunchIdentity,
  completeDesktopOwnership,
  registerDesktopOwnership
} from './playwright-desktop-ownership.mjs';
import {
  createDesktopLaunchOptions,
  resolveDesktopAppRoot,
  resolveDesktopLaunchTarget,
  resolveElectronExecutablePath
} from './playwright-desktop-launch-target.mjs';
import { assertRendererDistFresh } from './playwright-renderer-dist-freshness.mjs';

export async function prepareDesktopLaunch({
  appRoot = resolveDesktopAppRoot(), env = process.env, existsSync = fs.existsSync,
  extraArgs = [], isolationOptions = {}, timeoutMs
}) {
  const target = resolveDesktopLaunchTarget(appRoot, existsSync, env);
  if (target.missingPaths.length) throw new Error(`missing build output: ${target.missingPaths.join(', ')}`);
  if (target.launchMode !== 'installed') assertRendererDistFresh(target, env);
  const isolation = createDesktopIsolationContext(env, isolationOptions);
  target.runtimeStateRoot = isolation.runtimeStateRoot;
  const launchIdentity = createDesktopLaunchIdentity(env);
  const launchOptions = createDesktopLaunchOptions(
    target, timeoutMs, env, isolation, existsSync, [
      ...extraArgs,
      launchIdentity.launchArg,
      `--foliole-playwright-state-root=${target.runtimeStateRoot}`
    ]
  );
  const executable = launchOptions.executablePath ?? resolveElectronExecutablePath(target.appRoot, env, existsSync);
  return { executable, isolation, launchIdentity, launchOptions, target };
}

export async function ownDesktopApplication(electronApp, prepared, options) {
  return registerDesktopOwnership({
    appRoot: prepared.target.appRoot,
    executable: prepared.executable,
    launchIdentity: prepared.launchIdentity,
    launchMode: prepared.target.launchMode,
    mainEntry: prepared.target.mainEntry,
    mainPid: electronApp.process()?.pid,
    stateRoot: prepared.target.runtimeStateRoot
  }, options);
}

export async function closeDesktopSessionRuntime(electronApp, ownership, isolation, closeOptions) {
  const result = await closeDesktopApplication(electronApp, { ownership, ...closeOptions });
  if (result.confirmedExited) {
    completeDesktopOwnership(ownership);
    isolation.cleanup();
  }
  return result;
}
