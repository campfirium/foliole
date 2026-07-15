import { resolveGlobalCaptureAccelerators } from '../lib/platform/globalCaptureShortcut.js';
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

export type GlobalClipToastPosition = 'bottom-right' | 'top-right';

export function resolveGlobalClipToastPosition(
  rawValue: unknown,
  platform: NodeJS.Platform = process.platform
): GlobalClipToastPosition {
  if (platform !== 'darwin') return 'bottom-right';
  return rawValue === 'bottom-right' ? 'bottom-right' : 'top-right';
}

export function getGlobalClipToastPosition(platform: NodeJS.Platform = process.platform) {
  const rawValue = loadAppSettingsRecord()[APP_SETTINGS_STORAGE_KEYS.globalClipToastPosition];
  return resolveGlobalClipToastPosition(rawValue, platform);
}

function loadCommandShortcutOverrides() {
  const rawValue = loadAppSettingsRecord()[APP_SETTINGS_STORAGE_KEYS.commandShortcutOverrides];
  if (!rawValue) return {};
  try {
    return JSON.parse(rawValue) as unknown;
  } catch {
    return {};
  }
}

export function getGlobalClipShortcutAccelerators(platform: NodeJS.Platform = process.platform) {
  return resolveGlobalCaptureAccelerators(loadCommandShortcutOverrides(), platform);
}
