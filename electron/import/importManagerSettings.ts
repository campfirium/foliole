import {
  applyReadwiseRootPath,
  createDefaultImportManagerSettings,
  normalizeImportManagerSettings,
  type ImportManagerSettings
} from '../../lib/core/import/importManagerSettings.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

const IMPORT_MANAGER_SETTINGS_KEY = 'import_manager_settings';

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function loadImportManagerSettings(): ImportManagerSettings {
  try {
    return normalizeImportManagerSettings(loadJsonSetting(IMPORT_MANAGER_SETTINGS_KEY));
  } catch {
    return createDefaultImportManagerSettings();
  }
}

export function saveImportManagerSettings(settings: unknown): ImportManagerSettings {
  const payload = toRecord(settings);
  const current = loadImportManagerSettings();
  const readwiseRootPath = typeof payload.readwiseRootPath === 'string' ? payload.readwiseRootPath : current.readwiseRootPath;
  const normalized = normalizeImportManagerSettings({
    ...current,
    ...payload,
    readwiseRootPath,
    readwiseSources: Array.isArray(payload.readwiseSources)
      ? payload.readwiseSources
      : applyReadwiseRootPath(current.readwiseSources, readwiseRootPath),
    updatedAt: new Date().toISOString()
  });
  saveJsonSetting(IMPORT_MANAGER_SETTINGS_KEY, normalized, normalized.updatedAt);
  return normalized;
}
