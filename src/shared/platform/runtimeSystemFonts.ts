import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { toRuntimeSystemFontCatalog, type RuntimeSystemFontCatalog } from './runtimeEnvironmentPayloads';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export type { RuntimeSystemFontCatalog } from './runtimeEnvironmentPayloads';

export async function listRuntimeSystemFonts(): Promise<RuntimeSystemFontCatalog | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  try {
    const result = toRuntimeSystemFontCatalog(await runtimeInvoke(NATIVE_COMMANDS.listSystemFonts));
    if (!result) {
      logRuntimeWarning('native system font payload invalid', {
        area: 'bridge',
        action: 'list_runtime_system_fonts',
        command: NATIVE_COMMANDS.listSystemFonts,
        fallback: 'return_null'
      });
    }
    return result;
  } catch (error) {
    logRuntimeWarning('native system font listing failed', {
      area: 'bridge',
      action: 'list_runtime_system_fonts',
      command: NATIVE_COMMANDS.listSystemFonts,
      fallback: 'return_null',
      error
    });
    return null;
  }
}
