import { APP_SETTINGS_STORAGE_KEYS } from '../src/shared/config/appSettings.js';

import { loadJsonSetting, saveJsonSetting } from './database/settingsStore.js';

const APP_SETTINGS_KEY = 'app_settings';

export function isExistingClipboardFallbackEnabled() {
  const settings = loadJsonSetting(APP_SETTINGS_KEY);
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return true;
  }
  const value = (settings as Record<string, unknown>)[APP_SETTINGS_STORAGE_KEYS.globalClipExistingClipboardFallbackEnabled];
  return value !== 'false';
}

function loadAppSettingsRecord(): Record<string, string> {
  const settings = loadJsonSetting(APP_SETTINGS_KEY);
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(settings as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
}

export function isGlobalClipHintVisible() {
  return loadAppSettingsRecord()[APP_SETTINGS_STORAGE_KEYS.globalClipHintVisible] !== 'false';
}

export function setGlobalClipHintVisible(visible: boolean) {
  const nextSettings = loadAppSettingsRecord();
  nextSettings[APP_SETTINGS_STORAGE_KEYS.globalClipHintVisible] = visible ? 'true' : 'false';
  saveJsonSetting(APP_SETTINGS_KEY, nextSettings);
}
