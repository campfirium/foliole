import {
  createDefaultImportManagerSettings,
  normalizeImportManagerSettings,
  type ImportManagerSettings
} from '../../../lib/core/import/importManagerSettings';
import {
  hasImportManagerSettingsRuntimeRepository,
  loadImportManagerSettingsFromRuntime,
  saveImportManagerSettingsToRuntime
} from '../../shared/platform/importManagerSettingsRuntimeRepository';

export async function loadImportSourceWorkspaceSettings(): Promise<ImportManagerSettings> {
  if (!hasImportManagerSettingsRuntimeRepository()) {
    return createDefaultImportManagerSettings();
  }
  try {
    return normalizeImportManagerSettings(await loadImportManagerSettingsFromRuntime());
  } catch {
    return createDefaultImportManagerSettings();
  }
}

export async function saveImportSourceWorkspaceSettings(settings: ImportManagerSettings) {
  if (!hasImportManagerSettingsRuntimeRepository()) {
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
