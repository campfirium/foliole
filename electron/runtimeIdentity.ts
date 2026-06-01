import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolvePreloadScriptPath, resolveRendererIndexPath } from './runtimePaths.js';

type ExistsSync = (filePath: string) => boolean;

type MkdirSync = (dirPath: string, options: { recursive: true }) => void;

interface AppIdentityApi {
  getName(): string;
  getPath(name: 'appData' | 'sessionData' | 'userData'): string;
  setAppUserModelId?(id: string): void;
  setName(name: string): void;
  setPath(name: 'sessionData' | 'userData', value: string): void;
}

export interface RuntimeDiagnosticsSnapshot {
  appName: string;
  preloadPath: string;
  rendererUrl: string;
  userDataPath: string;
}

export interface ConfiguredAppIdentity {
  appDataRoot: string;
  appName: string;
  libraryHome: string | null;
  sessionDataPath: string;
  userDataPath: string;
}

export const FOLIOLE_APP_NAME = 'foliole';

export function resolveFolioleUserDataPath(appDataRoot: string) {
  return path.join(appDataRoot, FOLIOLE_APP_NAME);
}

function resolveOverridePath(envValue: string | undefined) {
  const trimmed = envValue?.trim();
  return trimmed ? path.resolve(trimmed) : null;
}

function readFlagValue(argv: string[], name: string) {
  const prefix = `${name}=`;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index] ?? '';
    if (value === name) {
      return argv[index + 1]?.trim() || null;
    }
    if (value.startsWith(prefix)) {
      return value.slice(prefix.length).trim() || null;
    }
  }
  return null;
}

function resolveLibraryHomeArg(argv = process.argv) {
  const value = readFlagValue(argv, '--library-home');
  return value ? path.resolve(value) : null;
}

export function configureRuntimeAppIdentity(
  app: AppIdentityApi,
  mkdirSync: MkdirSync,
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  argv = process.argv
): ConfiguredAppIdentity {
  app.setName(FOLIOLE_APP_NAME);
  const libraryHome = resolveOverridePath(env.FOLIOLE_LIBRARY_HOME) ?? resolveLibraryHomeArg(argv);
  if (libraryHome) {
    env.FOLIOLE_LIBRARY_HOME = libraryHome;
  }
  const appDataRoot = app.getPath('appData');
  const userDataPath = resolveOverridePath(env.FOLIOLE_USER_DATA_PATH) ?? resolveFolioleUserDataPath(appDataRoot);
  const sessionDataPath = resolveOverridePath(env.FOLIOLE_SESSION_DATA_PATH) ?? userDataPath;
  mkdirSync(userDataPath, { recursive: true });
  mkdirSync(sessionDataPath, { recursive: true });
  app.setPath('userData', userDataPath);
  app.setPath('sessionData', sessionDataPath);

  if (platform === 'win32') {
    app.setAppUserModelId?.(FOLIOLE_APP_NAME);
  }

  return {
    appDataRoot,
    appName: app.getName(),
    libraryHome,
    sessionDataPath: app.getPath('sessionData'),
    userDataPath: app.getPath('userData')
  };
}

export function resolveRendererTargetUrl(
  runtimeDir: string,
  existsSync: ExistsSync,
  env: NodeJS.ProcessEnv = process.env
) {
  const devUrl = env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    return devUrl;
  }

  return pathToFileURL(resolveRendererIndexPath(runtimeDir, existsSync)).toString();
}

export function collectRuntimeDiagnosticsSnapshot(args: {
  appName: string;
  env?: NodeJS.ProcessEnv;
  existsSync: ExistsSync;
  runtimeDir: string;
  userDataPath: string;
}): RuntimeDiagnosticsSnapshot {
  return {
    appName: args.appName,
    preloadPath: resolvePreloadScriptPath(args.runtimeDir, args.existsSync),
    rendererUrl: resolveRendererTargetUrl(args.runtimeDir, args.existsSync, args.env),
    userDataPath: args.userDataPath
  };
}

export function formatRuntimeDiagnosticsSnapshot(snapshot: RuntimeDiagnosticsSnapshot) {
  return JSON.stringify({
    type: 'runtime_context',
    ...snapshot
  });
}
