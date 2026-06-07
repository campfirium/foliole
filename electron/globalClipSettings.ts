import { APP_SETTINGS_STORAGE_KEYS } from '../src/shared/config/appSettings.js';

import { loadJsonSetting } from './database/settingsStore.js';

const APP_SETTINGS_KEY = 'app_settings';

export function isExistingClipboardFallbackEnabled() {
  const settings = loadJsonSetting(APP_SETTINGS_KEY);
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return true;
  }
  const value = (settings as Record<string, unknown>)[APP_SETTINGS_STORAGE_KEYS.globalClipExistingClipboardFallbackEnabled];
  return value !== 'false';
}
