import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

const APP_SETTINGS_KEY = 'app_settings';

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
  saveJsonSetting(APP_SETTINGS_KEY, normalizeAppSettingsPayload(settings));
}
