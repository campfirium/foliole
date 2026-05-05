import {
  createDefaultImportManagerSettings,
  normalizeImportManagerSettings,
  type ImportManagerSettings
} from '../../lib/core/import/importManagerSettings.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

const IMPORT_MANAGER_SETTINGS_KEY = 'import_manager_settings';

function toRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function loadImportManagerSettings(): ImportManagerSettings {
  try {
    return normalizeImportManagerSettings(loadJsonSetting(IMPORT_MANAGER_SETTINGS_KEY));
  } catch {
    return createDefaultImportManagerSettings();
  }
}

export function saveImportManagerSettings(settings: unknown): ImportManagerSettings {
  const normalized = normalizeImportManagerSettings({
    ...createDefaultImportManagerSettings(),
    ...toRecord(settings),
    updatedAt: new Date().toISOString()
  });
  saveJsonSetting(IMPORT_MANAGER_SETTINGS_KEY, normalized, normalized.updatedAt);
  return normalized;
}
