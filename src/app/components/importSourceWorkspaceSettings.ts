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

export const IMPORT_SOURCE_WORKSPACE_SETTINGS_CHANGED_EVENT =
  'foliole:import-source-workspace-settings-changed';

function notifyImportSourceWorkspaceSettingsChanged(settings: ImportManagerSettings) {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(IMPORT_SOURCE_WORKSPACE_SETTINGS_CHANGED_EVENT, { detail: settings })
  );
}

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
    notifyImportSourceWorkspaceSettingsChanged(settings);
    return settings;
  }
  try {
    const nextSettings = normalizeImportManagerSettings(
      await saveImportManagerSettingsToRuntime(settings)
    );
    notifyImportSourceWorkspaceSettingsChanged(nextSettings);
    return nextSettings;
  } catch {
    notifyImportSourceWorkspaceSettingsChanged(settings);
    return settings;
  }
}
