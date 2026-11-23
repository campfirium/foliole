import {
  normalizeAideAttachedContextSettings,
  type AideAttachedContextSettings
} from '../../lib/core/assistant/aideAttachedContextSettings.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

export const FOLIOLE_AIDE_ATTACHED_CONTEXT_SETTINGS_KEY = 'foliole_aide_attached_context_settings';

export function loadFolioleAideAttachedContextSettings(): AideAttachedContextSettings {
  return normalizeAideAttachedContextSettings(loadJsonSetting(FOLIOLE_AIDE_ATTACHED_CONTEXT_SETTINGS_KEY));
}

export function saveFolioleAideAttachedContextSettings(value: unknown): AideAttachedContextSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_attached_context_settings');
  const settings = normalizeAideAttachedContextSettings(value);
  saveJsonSetting(FOLIOLE_AIDE_ATTACHED_CONTEXT_SETTINGS_KEY, { ...settings, version: 1 });
  return settings;
}
