import {
  getLocalStorageAppSettingsKeys,
  getRuntimeAppSettingsKeys
} from '../../src/shared/config/appSettingsClassification.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

const APP_SETTINGS_KEY = 'app_settings';
const RUNTIME_APP_SETTINGS_KEYS = new Set<string>(getRuntimeAppSettingsKeys());
const LOCAL_STORAGE_APP_SETTINGS_KEYS = new Set<string>(getLocalStorageAppSettingsKeys());
const RUNTIME_ONLY_APP_SETTINGS_KEYS = new Set<string>(
  getRuntimeAppSettingsKeys().filter((key) => !LOCAL_STORAGE_APP_SETTINGS_KEYS.has(key))
);

function normalizeAppSettingsPayload(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  const entries = Object.entries(payload as Record<string, unknown>);
  const normalized: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof key !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(key)) {
      continue;
    }
    if (!RUNTIME_APP_SETTINGS_KEYS.has(key)) {
      continue;
    }
    if (typeof value !== 'string') {
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
}

export async function loadAppSettingsState(): Promise<Record<string, string>> {
  return normalizeAppSettingsPayload(loadJsonSetting(APP_SETTINGS_KEY));
}

export async function saveAppSettingsState(settings: Record<string, unknown>): Promise<void> {
  const incomingSettings = normalizeAppSettingsPayload(settings);
  const preservedRuntimeSettings = Object.fromEntries(
    Object.entries(normalizeAppSettingsPayload(loadJsonSetting(APP_SETTINGS_KEY))).filter(([key]) =>
      RUNTIME_ONLY_APP_SETTINGS_KEYS.has(key)
    )
  );
  const nextSettings = {
    ...preservedRuntimeSettings,
    ...incomingSettings
  };
  saveJsonSetting(APP_SETTINGS_KEY, nextSettings);
}
