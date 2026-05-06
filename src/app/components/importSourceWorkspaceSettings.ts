import {
  createDefaultImportManagerSettings,
  normalizeImportManagerSettings,
  type ImportManagerSettings
} from '../../../lib/core/import/importManagerSettings';
import {
  hasAppRuntimeCommandRepository,
  loadImportManagerSettingsFromRuntime,
  saveImportManagerSettingsToRuntime
} from '../../shared/platform/appRuntimeCommandRepository';

export async function loadImportSourceWorkspaceSettings(): Promise<ImportManagerSettings> {
  if (!hasAppRuntimeCommandRepository()) {
    return createDefaultImportManagerSettings();
  }
  try {
    return normalizeImportManagerSettings(await loadImportManagerSettingsFromRuntime());
  } catch {
    return createDefaultImportManagerSettings();
  }
}

export async function saveImportSourceWorkspaceSettings(settings: ImportManagerSettings) {
  if (!hasAppRuntimeCommandRepository()) {
    return settings;
  }
  try {
    return normalizeImportManagerSettings(
      await saveImportManagerSettingsToRuntime(settings)
    );
  } catch {
    return settings;
  }
}
