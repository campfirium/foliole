import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolvePreloadScriptPath, resolveRendererIndexPath } from './runtimePaths.js';

type ExistsSync = (filePath: string) => boolean;

type MkdirSync = (dirPath: string, options: { recursive: true }) => void;
type RmSync = (dirPath: string, options: { force: true; recursive: true }) => void;

interface AppIdentityApi {
  getName(): string;
  getPath(name: 'appData' | 'sessionData' | 'temp' | 'userData'): string;
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
  previewSandbox: boolean;
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

function hasFlag(argv: string[], name: string) {
  return argv.includes(name);
}

function hasFlagOrValue(argv: string[], name: string) {
  const prefix = `${name}=`;
  return argv.some((value) => value === name || value.startsWith(prefix));
}

function normalizeGuidedSampleLocale(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed === 'en-US' || trimmed === 'zh-CN' ? trimmed : null;
}

function resolvePreviewSandboxRoot(app: AppIdentityApi, env: NodeJS.ProcessEnv, argv: string[]) {
  const override = resolveOverridePath(env.FOLIOLE_PREVIEW_SANDBOX_ROOT) ?? resolveOverridePath(readFlagValue(argv, '--preview-sandbox-root') ?? undefined);
  return override ?? path.join(app.getPath('temp'), FOLIOLE_APP_NAME, 'preview-sandbox');
}

function isProtectedSandboxResetPath(value: string, protectedPaths: string[]) {
  const normalized = path.resolve(value);
  return protectedPaths.some((protectedPath) => normalized === path.resolve(protectedPath));
}

function resetPreviewSandboxPaths(paths: string[], protectedPaths: string[], rmSync: RmSync | undefined) {
  if (!rmSync) return;
  for (const dirPath of paths) {
    if (isProtectedSandboxResetPath(dirPath, protectedPaths)) {
      throw new Error(`refusing preview sandbox reset for protected path: ${dirPath}`);
    }
    rmSync(dirPath, { force: true, recursive: true });
  }
}

export function configureRuntimeAppIdentity(
  app: AppIdentityApi,
  mkdirSync: MkdirSync,
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  argv = process.argv,
  rmSync?: RmSync
): ConfiguredAppIdentity {
  app.setName(FOLIOLE_APP_NAME);
  const sampleLaunch = hasFlagOrValue(argv, '--sample-locale');
  const previewSandbox = env.FOLIOLE_PREVIEW_SANDBOX === '1' || hasFlag(argv, '--preview-sandbox') || sampleLaunch;
  if (previewSandbox) {
    env.FOLIOLE_ALLOW_PARALLEL_INSTANCE = '1';
  }
  const sandboxRoot = previewSandbox ? resolvePreviewSandboxRoot(app, env, argv) : null;
  const sampleLocale = normalizeGuidedSampleLocale(env.FOLIOLE_GUIDED_SAMPLE_LOCALE) ?? normalizeGuidedSampleLocale(readFlagValue(argv, '--sample-locale'));
  if (sampleLocale) {
    env.FOLIOLE_GUIDED_SAMPLE_LOCALE = sampleLocale;
  }
  const sandboxLibraryHome = sandboxRoot ? path.join(sandboxRoot, 'library') : null;
  const libraryHome =
    resolveOverridePath(env.FOLIOLE_LIBRARY_HOME) ?? resolveLibraryHomeArg(argv) ?? sandboxLibraryHome;
  if (libraryHome) {
    env.FOLIOLE_LIBRARY_HOME = libraryHome;
  }
  const appDataRoot = app.getPath('appData');
  const defaultUserDataPath = resolveFolioleUserDataPath(appDataRoot);
  const sandboxUserDataPath = sandboxRoot ? path.join(sandboxRoot, 'user-data') : null;
  const userDataPath = resolveOverridePath(env.FOLIOLE_USER_DATA_PATH) ?? sandboxUserDataPath ?? defaultUserDataPath;
  const sessionDataPath = resolveOverridePath(env.FOLIOLE_SESSION_DATA_PATH) ?? userDataPath;
  if (previewSandbox && env.FOLIOLE_PREVIEW_SANDBOX_RESET !== '0') {
    resetPreviewSandboxPaths(
      Array.from(new Set([libraryHome, userDataPath, sessionDataPath].filter((value): value is string => Boolean(value)))),
      [defaultUserDataPath, appDataRoot],
      rmSync
    );
  }
  mkdirSync(userDataPath, { recursive: true });
  mkdirSync(sessionDataPath, { recursive: true });
  if (libraryHome) {
    mkdirSync(libraryHome, { recursive: true });
  }
  app.setPath('userData', userDataPath);
  app.setPath('sessionData', sessionDataPath);

  if (platform === 'win32') {
    app.setAppUserModelId?.(FOLIOLE_APP_NAME);
  }

  return {
    appDataRoot,
    appName: app.getName(),
    libraryHome,
    previewSandbox,
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
