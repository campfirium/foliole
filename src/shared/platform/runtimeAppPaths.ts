import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { toRuntimeAppPaths, type RuntimeAppPaths } from './runtimeEnvironmentPayloads';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeEvent, logRuntimeWarning } from './runtimeLogging';

export type { RuntimeAppPaths } from './runtimeEnvironmentPayloads';

export async function resolveRuntimeAppPaths(): Promise<RuntimeAppPaths | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    logRuntimeEvent({
      event: 'bridge_unavailable',
      level: 'warn',
      payload: {
        action: 'resolve_runtime_app_paths',
        command: NATIVE_COMMANDS.resolveAppPaths,
        fallback: 'return_null'
      },
      source: 'renderer.bridge'
    });
    return null;
  }
  try {
    const result = toRuntimeAppPaths(await runtimeInvoke(NATIVE_COMMANDS.resolveAppPaths));
    if (!result) {
      logRuntimeWarning('native app path payload invalid', {
        area: 'bridge',
        action: 'resolve_runtime_app_paths',
        command: NATIVE_COMMANDS.resolveAppPaths,
        fallback: 'return_null'
      });
    }
    return result;
  } catch (error) {
    logRuntimeWarning('native app path resolve failed', {
      area: 'bridge',
      action: 'resolve_runtime_app_paths',
      command: NATIVE_COMMANDS.resolveAppPaths,
      fallback: 'return_null',
      error
    });
    return null;
  }
}
