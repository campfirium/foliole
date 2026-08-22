import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export async function selectRuntimeFolder(defaultPath?: string): Promise<string | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.selectImportDirectory, {
      ...(defaultPath ? { default_path: defaultPath } : {})
    });
    return typeof result === 'string' && result.trim().length > 0 ? result : null;
  } catch (error) {
    logRuntimeWarning('native folder selection failed', {
      action: 'select_runtime_folder',
      area: 'bridge',
      command: NATIVE_COMMANDS.selectImportDirectory,
      fallback: 'rethrow_to_ui',
      error
    });
    throw error;
  }
}
