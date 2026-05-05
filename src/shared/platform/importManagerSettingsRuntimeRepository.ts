import type { ImportManagerSettings } from '../../../lib/core/import/importManagerSettings';
import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './bridge';

export function hasImportManagerSettingsRuntimeRepository() {
  return Boolean(getRuntimeInvoke());
}

export async function loadImportManagerSettingsFromRuntime(): Promise<unknown | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.loadImportManagerSettings);
}

export async function saveImportManagerSettingsToRuntime(settings: ImportManagerSettings): Promise<unknown | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.saveImportManagerSettings, { settings });
}
