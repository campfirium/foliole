import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createDesktopIsolationContext } from './playwright-desktop-isolation.mjs';

const DEFAULT_WINDOWS_WORKDIR = 'D:\\C\\foliole';

function resolveConfiguredWindowsWorkdir(env = process.env) {
  const configuredWorkdir = env.FOLIOLE_WINDOWS_WORKDIR?.trim() || env.WINDOWS_WORKDIR?.trim();
  if (configuredWorkdir) {
    return path.win32.resolve(normalizeWindowsDrivePath(configuredWorkdir));
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

function normalizeWindowsDrivePath(value) {
  return value.replace(/^([A-Za-z]):(?![\\/])/, '$1:\\');
}

function isWindowsDrivePath(value) {
  return /^[A-Za-z]:/.test(value);
}

function isWindowsHostPath(value) {
  return isWindowsDrivePath(value) || value.startsWith('\\\\');
}

function resolveHostPath(value) {
  return isWindowsHostPath(value) ? path.win32.resolve(normalizeWindowsDrivePath(value)) : path.resolve(value);
}

function joinHostPath(root, ...segments) {
  return isWindowsHostPath(root) ? path.win32.join(normalizeWindowsDrivePath(root), ...segments) : path.join(root, ...segments);
}

export function resolveDesktopAppRoot(env = process.env) {
  const configuredRoot = env.FOLIOLE_ELECTRON_APP_ROOT?.trim();
  if (configuredRoot) {
    return resolveHostPath(configuredRoot);
  }
  const windowsWorkdir = resolveConfiguredWindowsWorkdir(env);
  return process.platform === 'win32' ? windowsWorkdir : resolveWslMirrorRoot(windowsWorkdir);
}

export function resolveDesktopLaunchTarget(appRoot, existsSync = fs.existsSync) {
  const resolvedAppRoot = resolveHostPath(appRoot);
  const mainEntry = joinHostPath(resolvedAppRoot, 'electron-dist', 'electron', 'main.js');
  const preloadPath = joinHostPath(resolvedAppRoot, 'electron', 'preload.cjs');
  const rendererIndexPath = joinHostPath(resolvedAppRoot, 'dist', 'index.html');
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
    return resolveHostPath(configuredPath);
  }
  const resolvedAppRoot = resolveHostPath(appRoot);
  const candidatePaths = [
    joinHostPath(resolvedAppRoot, 'node_modules', 'electron', 'dist', 'electron.exe'),
    joinHostPath(resolvedAppRoot, 'node_modules', 'electron', 'dist', 'electron')
  ];
  return candidatePaths.find((candidatePath) => existsSync(candidatePath));
}

export function createDesktopLaunchOptions(
  target,
  timeoutMs,
  env = process.env,
  isolation = createDesktopIsolationContext(env),
  existsSync = fs.existsSync,
  extraArgs = []
) {
  const executablePath = resolveElectronExecutablePath(target.appRoot, env, existsSync);
  const launchEnv = {
    ...env,
    ...isolation.env,
    FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE: env.FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE?.trim() || '1'
  };
  delete launchEnv.ELECTRON_RUN_AS_NODE;
  return {
    args: [target.mainEntry, ...extraArgs],
    cwd: target.appRoot,
    env: launchEnv,
    executablePath: executablePath ? resolveHostPath(executablePath) : undefined,
    timeout: timeoutMs
  };
}
