import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export type RuntimeLibraryPathLocation = 'library_home' | 'inbox' | 'mirror';

export interface RuntimeLibraryPaths {
  assetsDir: string;
  dataDir: string;
  databasePath: string;
  inbox: string;
  libraryHome: string;
  mirror: string;
  updatedAt: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toRuntimeLibraryPaths(payload: unknown): RuntimeLibraryPaths | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const value = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(value.assets_dir) ||
    !isNonEmptyString(value.data_dir) ||
    !isNonEmptyString(value.database_path) ||
    !isNonEmptyString(value.inbox) ||
    !isNonEmptyString(value.library_home) ||
    !isNonEmptyString(value.mirror) ||
    !isNonEmptyString(value.updated_at)
  ) {
    return null;
  }

  return {
    assetsDir: value.assets_dir,
    dataDir: value.data_dir,
    databasePath: value.database_path,
    inbox: value.inbox,
    libraryHome: value.library_home,
    mirror: value.mirror,
    updatedAt: value.updated_at
  };
}

export async function loadRuntimeLibraryPathSettings(): Promise<RuntimeLibraryPaths | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const result = toRuntimeLibraryPaths(await runtimeInvoke(NATIVE_COMMANDS.loadLibraryPathSettings));
    if (!result) {
      logRuntimeWarning('native library path payload invalid', {
        action: 'load_runtime_library_path_settings',
        area: 'bridge',
        command: NATIVE_COMMANDS.loadLibraryPathSettings,
        fallback: 'return_null'
      });
    }
    return result;
  } catch (error) {
    logRuntimeWarning('native library path load failed', {
      action: 'load_runtime_library_path_settings',
      area: 'bridge',
      command: NATIVE_COMMANDS.loadLibraryPathSettings,
      fallback: 'return_null',
      error
    });
    return null;
  }
}

export async function updateRuntimeLibraryPathSetting(
  location: RuntimeLibraryPathLocation,
  nextPath: string | null
): Promise<RuntimeLibraryPaths> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    throw new Error('desktop runtime unavailable');
  }

  try {
    const result = toRuntimeLibraryPaths(
      await runtimeInvoke(NATIVE_COMMANDS.updateLibraryPathSetting, {
        location,
        path: nextPath
      })
    );
    if (!result) {
      throw new Error('native library path payload invalid');
    }
    return result;
  } catch (error) {
    logRuntimeWarning('native library path update failed', {
      action: 'update_runtime_library_path_setting',
      area: 'bridge',
      command: NATIVE_COMMANDS.updateLibraryPathSetting,
      fallback: 'rethrow_to_ui',
      error,
      location
    });
    throw error;
  }
}
