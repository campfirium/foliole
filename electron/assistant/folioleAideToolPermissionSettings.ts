import {
  normalizeAideToolPermissionSettings,
  type AideToolPermissionSettings
} from '../../lib/core/assistant/aideToolPermissionSettings.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

export const FOLIOLE_AIDE_TOOL_PERMISSIONS_KEY = 'foliole_aide_tool_permissions';

export function loadFolioleAideToolPermissionSettings(): AideToolPermissionSettings {
  return normalizeAideToolPermissionSettings(loadJsonSetting(FOLIOLE_AIDE_TOOL_PERMISSIONS_KEY));
}

export function saveFolioleAideToolPermissionSettings(value: unknown): AideToolPermissionSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_tool_permission_settings');
  const settings = normalizeAideToolPermissionSettings(value);
  saveJsonSetting(FOLIOLE_AIDE_TOOL_PERMISSIONS_KEY, { ...settings, version: 1 });
  return settings;
}
