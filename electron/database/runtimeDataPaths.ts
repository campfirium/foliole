import path from 'node:path';

import { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';
import { resolveAppPaths } from '../ipc/paths.js';

const LEGACY_DATABASE_FILENAME = 'foliole.db';

export interface RuntimeDataPaths {
  assetsDir: string;
  databasePath: string;
  mode: 'legacy_appdata' | 'library';
}

let runtimeDataPathsOverride: RuntimeDataPaths | null = null;

export function clearRuntimeDataPathsOverride() {
  runtimeDataPathsOverride = null;
}

export function setRuntimeDataPathsOverride(paths: RuntimeDataPaths | null) {
  runtimeDataPathsOverride = paths;
}

export function resolveLegacyAppDataRuntimeDataPaths(appDataDir = resolveAppPaths().app_data_dir): RuntimeDataPaths {
  return {
    assetsDir: appDataDir,
    databasePath: path.join(appDataDir, LEGACY_DATABASE_FILENAME),
    mode: 'legacy_appdata'
  };
}

function resolveLibraryRuntimeDataPaths(): RuntimeDataPaths {
  const libraryPaths = loadLibraryPathSettingsSync();
  return {
    assetsDir: libraryPaths.assets_dir,
    databasePath: libraryPaths.database_path,
    mode: 'library'
  };
}

export function resolveRuntimeDataPaths(): RuntimeDataPaths {
  return runtimeDataPathsOverride ?? resolveLibraryRuntimeDataPaths();
}
