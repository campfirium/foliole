import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  FOLIOLE_APP_NAME,
  FOLIOLE_INTERNAL_APP_NAME,
  resolveAppDataRoot
} from '../agent-control/foliole-agent-runtime-paths.mjs';

const STATE_ROOT_ENV = 'FOLIOLE_ELECTRON_TEST_STATE_ROOT';
const MAIN_DATABASE_PATH = 'D:\\X\\U\\Foliole\\Data\\foliole.db';

function normalizeWindowsDrivePath(value) {
  return value.replace(/^([A-Za-z]):(?![\\/])/, '$1:\\');
}

function isWindowsHostPath(value) {
  return /^[A-Za-z]:/.test(value) || value.startsWith('\\\\');
}

function resolveComparablePath(value) {
  const resolved = isWindowsHostPath(value)
    ? path.win32.resolve(normalizeWindowsDrivePath(value))
    : path.resolve(value);
  return process.platform === 'win32' || isWindowsHostPath(value) ? resolved.toLowerCase() : resolved;
}

function resolveHostPath(value) {
  return isWindowsHostPath(value)
    ? path.win32.resolve(normalizeWindowsDrivePath(value))
    : path.resolve(value);
}

function joinHostPath(root, segment) {
  return isWindowsHostPath(root) ? path.win32.join(root, segment) : path.join(root, segment);
}

function pathContainsOrEquals(candidatePath, protectedPath) {
  const candidate = resolveComparablePath(candidatePath);
  const protectedValue = resolveComparablePath(protectedPath);
  const separator = isWindowsHostPath(candidatePath) || isWindowsHostPath(protectedPath) ? '\\' : path.sep;
  return (
    candidate === protectedValue ||
    candidate.startsWith(`${protectedValue}${separator}`) ||
    protectedValue.startsWith(`${candidate}${separator}`)
  );
}

function pathIsInsideRoot(candidatePath, rootPath) {
  const candidate = resolveComparablePath(candidatePath);
  const root = resolveComparablePath(rootPath);
  const separator = isWindowsHostPath(candidatePath) || isWindowsHostPath(rootPath) ? '\\' : path.sep;
  return candidate === root || candidate.startsWith(`${root}${separator}`);
}

export function resolveProtectedDesktopPaths(env, {
  homeDir = os.homedir(),
  platform = process.platform
} = {}) {
  const mainDatabasePath = env.FOLIOLE_MAIN_DATABASE_PATH?.trim() || MAIN_DATABASE_PATH;
  const appDataRoot = resolveAppDataRoot(platform, env, homeDir);
  return [
    mainDatabasePath,
    isWindowsHostPath(mainDatabasePath) ? path.win32.dirname(mainDatabasePath) : path.dirname(mainDatabasePath),
    path.join(appDataRoot, FOLIOLE_APP_NAME),
    path.join(appDataRoot, FOLIOLE_INTERNAL_APP_NAME)
  ].filter(Boolean);
}

function assertUnprotectedPath(label, candidatePath, env, options) {
  const protectedPath = resolveProtectedDesktopPaths(env, options).find((currentPath) =>
    pathContainsOrEquals(candidatePath, currentPath)
  );
  if (protectedPath) {
    throw new Error(`refusing desktop Playwright ${label} path because it overlaps protected path: ${candidatePath}`);
  }
}

export function createDesktopIsolationContext(env = process.env, options = {}) {
  const configuredStateRoot = env[STATE_ROOT_ENV]?.trim();
  const runtimeStateRoot = configuredStateRoot
    ? resolveHostPath(configuredStateRoot)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-playwright-'));

  const persistedLibraryHome = typeof options.persistedLibraryHome === 'string'
    ? resolveHostPath(options.persistedLibraryHome)
    : null;
  if (persistedLibraryHome && !pathIsInsideRoot(persistedLibraryHome, runtimeStateRoot)) {
    throw new Error(`refusing persisted desktop Playwright library home outside state root: ${persistedLibraryHome}`);
  }
  const libraryHome = persistedLibraryHome ?? joinHostPath(runtimeStateRoot, 'library');
  const userDataPath = joinHostPath(runtimeStateRoot, 'user-data');
  const sessionDataPath = joinHostPath(runtimeStateRoot, 'session-data');
  for (const [label, candidatePath] of [
    ['state root', runtimeStateRoot],
    ['library home', libraryHome],
    ['user data', userDataPath],
    ['session data', sessionDataPath]
  ]) {
    assertUnprotectedPath(label, candidatePath, env, options);
  }

  return {
    cleanup() {
      if (!configuredStateRoot) {
        fs.rmSync(runtimeStateRoot, { force: true, recursive: true });
      }
    },
    env: {
      FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1',
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: runtimeStateRoot,
      ...(persistedLibraryHome ? {} : { FOLIOLE_LIBRARY_HOME: libraryHome }),
      FOLIOLE_SESSION_DATA_PATH: sessionDataPath,
      FOLIOLE_USER_DATA_PATH: userDataPath,
      FOLIOLE_WORKDIR: runtimeStateRoot
    },
    libraryHome,
    runtimeStateRoot,
    sessionDataPath,
    userDataPath,
    usesPersistedLibraryHome: Boolean(persistedLibraryHome)
  };
}
