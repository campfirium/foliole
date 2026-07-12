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

function resolveInstalledExePath(env = process.env) {
  const configuredPath = env.FOLIOLE_ELECTRON_INSTALLED_EXE_PATH?.trim();
  if (configuredPath) {
    return resolveHostPath(configuredPath);
  }
  const localAppData = env.LOCALAPPDATA?.trim();
  return localAppData ? path.win32.join(localAppData, 'Programs', 'Foliole', 'Foliole.exe') : null;
}

export function resolveDesktopAppRoot(env = process.env) {
  const configuredRoot = env.FOLIOLE_ELECTRON_APP_ROOT?.trim();
  if (configuredRoot) {
    return resolveHostPath(configuredRoot);
  }
  if (process.platform !== 'win32') {
    return path.resolve('.');
  }
  const windowsWorkdir = resolveConfiguredWindowsWorkdir(env);
  return windowsWorkdir;
}

export function resolveDesktopLaunchTarget(appRoot, existsSync = fs.existsSync, env = process.env) {
  if (env.FOLIOLE_ELECTRON_LAUNCH_MODE === 'installed' || env.FOLIOLE_ELECTRON_INSTALLED_EXE_PATH) {
    const executablePath = resolveInstalledExePath(env);
    const resolvedExecutablePath = executablePath ? resolveHostPath(executablePath) : null;
    return {
      appRoot: resolvedExecutablePath ? path.win32.dirname(resolvedExecutablePath) : resolveHostPath(appRoot),
      executablePath: resolvedExecutablePath,
      launchMode: 'installed',
      mainEntry: null,
      missingPaths: resolvedExecutablePath && existsSync(resolvedExecutablePath) ? [] : [resolvedExecutablePath ?? 'Foliole.exe'],
      preloadPath: null,
      rendererIndexPath: null
    };
  }
  const resolvedAppRoot = resolveHostPath(appRoot);
  const mainEntry = joinHostPath(resolvedAppRoot, 'dist', 'electron', 'main.js');
  const preloadPath = joinHostPath(resolvedAppRoot, 'electron', 'preload.cjs');
  const rendererIndexPath = joinHostPath(resolvedAppRoot, 'dist', 'desktop', 'index.html');
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
  const candidatePaths = process.platform === 'win32'
    ? [joinHostPath(resolvedAppRoot, 'node_modules', 'electron', 'dist', 'electron.exe')]
    : [joinHostPath(resolvedAppRoot, 'node_modules', 'electron', 'dist', 'electron')];
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
  const executablePath = resolvePlaywrightExecutablePath(target, env, existsSync);
  const launchEnv = {
    ...env,
    ...isolation.env,
    FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE: env.FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE?.trim() || '1'
  };
  delete launchEnv.ELECTRON_RUN_AS_NODE;
  return {
    args: createElectronLaunchArgs(target.mainEntry, env, extraArgs),
    cwd: target.appRoot,
    env: launchEnv,
    executablePath: executablePath ? resolveHostPath(executablePath) : undefined,
    timeout: timeoutMs
  };
}

function resolvePlaywrightExecutablePath(target, env, existsSync) {
  if (target.launchMode === 'installed') {
    return target.executablePath;
  }
  if (env.FOLIOLE_ELECTRON_EXECUTABLE_PATH?.trim()) {
    return resolveElectronExecutablePath(target.appRoot, env, existsSync);
  }
  return undefined;
}

function createElectronLaunchArgs(mainEntry, env, extraArgs) {
  const args = [];
  if (env.FOLIOLE_DISABLE_HARDWARE_ACCELERATION === '1') {
    args.push('--disable-gpu', '--disable-gpu-compositing', '--disable-gpu-sandbox');
  }
  if (env.FOLIOLE_DISABLE_CHROMIUM_SANDBOX_FOR_DEBUG === '1') {
    args.push('--no-sandbox');
  }
  if (mainEntry) {
    args.push(mainEntry);
  }
  args.push(...extraArgs);
  return args;
}
