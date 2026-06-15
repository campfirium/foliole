import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

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

function resolveDefaultUserDataPath(env) {
  const appDataRoot = env.APPDATA?.trim();
  return appDataRoot ? path.join(appDataRoot, 'foliole') : null;
}

function resolveProtectedPaths(env) {
  const mainDatabasePath = env.FOLIOLE_MAIN_DATABASE_PATH?.trim() || MAIN_DATABASE_PATH;
  return [
    mainDatabasePath,
    path.dirname(mainDatabasePath),
    resolveDefaultUserDataPath(env)
  ].filter(Boolean);
}

function assertUnprotectedPath(label, candidatePath, env) {
  const protectedPath = resolveProtectedPaths(env).find((currentPath) =>
    pathContainsOrEquals(candidatePath, currentPath)
  );
  if (protectedPath) {
    throw new Error(`refusing desktop Playwright ${label} path because it overlaps protected path: ${candidatePath}`);
  }
}

export function createDesktopIsolationContext(env = process.env) {
  const configuredStateRoot = env[STATE_ROOT_ENV]?.trim();
  const runtimeStateRoot = configuredStateRoot
    ? path.resolve(configuredStateRoot)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-playwright-'));

  const libraryHome = path.join(runtimeStateRoot, 'library');
  const userDataPath = path.join(runtimeStateRoot, 'user-data');
  const sessionDataPath = path.join(runtimeStateRoot, 'session-data');
  for (const [label, candidatePath] of [
    ['state root', runtimeStateRoot],
    ['library home', libraryHome],
    ['user data', userDataPath],
    ['session data', sessionDataPath]
  ]) {
    assertUnprotectedPath(label, candidatePath, env);
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
      FOLIOLE_LIBRARY_HOME: libraryHome,
      FOLIOLE_SESSION_DATA_PATH: sessionDataPath,
      FOLIOLE_USER_DATA_PATH: userDataPath,
      FOLIOLE_WORKDIR: runtimeStateRoot
    },
    libraryHome,
    runtimeStateRoot,
    sessionDataPath,
    userDataPath
  };
}
