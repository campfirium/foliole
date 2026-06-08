import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createDesktopIsolationContext } from './playwright-desktop-isolation.mjs';

const DEFAULT_WINDOWS_WORKDIR = 'D:\\C\\foliole';

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
  return process.platform === 'win32' ? windowsWorkdir : resolveWslMirrorRoot(windowsWorkdir);
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

export function resolveElectronExecutablePath(appRoot, env = process.env, existsSync = fs.existsSync) {
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
