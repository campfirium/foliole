import { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';

export interface RuntimeDataPaths {
  assetsDir: string;
  databasePath: string;
  mode: 'library';
}

export function resolveRuntimeDataPaths(): RuntimeDataPaths {
  const libraryPaths = loadLibraryPathSettingsSync();
  return {
    assetsDir: libraryPaths.assets_dir,
    databasePath: libraryPaths.database_path,
    mode: 'library'
  };
}
