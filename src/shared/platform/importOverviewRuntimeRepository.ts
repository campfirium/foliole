import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { toRuntimeImportOverview, type RuntimeImportOverview } from './importBridgePayloads';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export type { RuntimeImportOverview } from './importBridgePayloads';

export async function loadRuntimeImportOverview(): Promise<RuntimeImportOverview | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const overview = toRuntimeImportOverview(await runtimeInvoke(NATIVE_COMMANDS.loadImportOverview));
    if (!overview) {
      logRuntimeWarning('native import overview payload invalid', {
        action: 'load_runtime_import_overview',
        area: 'bridge',
        command: NATIVE_COMMANDS.loadImportOverview,
        fallback: 'return_null'
      });
    }
    return overview;
  } catch (error) {
    logRuntimeWarning('native import overview loading failed', {
      action: 'load_runtime_import_overview',
      area: 'bridge',
      command: NATIVE_COMMANDS.loadImportOverview,
      fallback: 'return_null',
      error
    });
    return null;
  }
}

export async function resetRuntimeImportData() {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  return runtimeInvoke(NATIVE_COMMANDS.resetImportData);
}
