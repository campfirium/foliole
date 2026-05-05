import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export async function selectRuntimeImportDirectory(): Promise<string | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.selectImportDirectory);
    return typeof result === 'string' && result.trim().length > 0 ? result : null;
  } catch (error) {
    logRuntimeWarning('native import directory selection failed', {
      action: 'select_runtime_import_directory',
      area: 'bridge',
      command: NATIVE_COMMANDS.selectImportDirectory,
      fallback: 'rethrow_to_ui',
      error
    });
    throw error;
  }
}
