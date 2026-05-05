import {
  createDefaultImportManagerSettings,
  normalizeImportManagerSettings,
  type ImportManagerSettings
} from '../../../lib/core/import/importManagerSettings';
import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../../shared/platform/bridge';

export async function loadImportSourceWorkspaceSettings(): Promise<ImportManagerSettings> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return createDefaultImportManagerSettings();
  }
  try {
    return normalizeImportManagerSettings(await runtimeInvoke(NATIVE_COMMANDS.loadImportManagerSettings));
  } catch {
    return createDefaultImportManagerSettings();
  }
}

export async function saveImportSourceWorkspaceSettings(settings: ImportManagerSettings) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return settings;
  }
  try {
    return normalizeImportManagerSettings(
      await runtimeInvoke(NATIVE_COMMANDS.saveImportManagerSettings, {
        settings
      })
    );
  } catch {
    return settings;
  }
}
