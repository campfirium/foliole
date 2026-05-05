import { loadRuntimeAppSettingsState, saveRuntimeAppSettingsState } from './appSettingsState';
import { getLocalStorageWhitelist } from './storage';

function getBrowserLocalStorage() {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage;
}

function readWhitelistedLocalSettings() {
  const storage = getBrowserLocalStorage();
  if (!storage) {
    return {} as Record<string, string>;
  }
  const snapshot: Record<string, string> = {};
  for (const key of getLocalStorageWhitelist()) {
    const value = storage.getItem(key);
    if (typeof value === 'string') {
      snapshot[key] = value;
    }
  }
  return snapshot;
}

function normalizeSettingsPayload(value: unknown) {
  if (!value || typeof value !== 'object') {
    return {} as Record<string, string>;
  }
  const allowedKeys = new Set(getLocalStorageWhitelist());
  const normalized: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!allowedKeys.has(key) || typeof item !== 'string') {
      continue;
    }
    normalized[key] = item;
  }
  return normalized;
}

function writeWhitelistedLocalSettings(settings: Record<string, string>) {
  const storage = getBrowserLocalStorage();
  if (!storage) {
    return;
  }
  for (const key of getLocalStorageWhitelist()) {
    const value = settings[key];
    if (typeof value === 'string') {
      storage.setItem(key, value);
    }
  }
}

export async function syncAppSettingsWithRuntime() {
  const localSnapshot = readWhitelistedLocalSettings();
  const runtimeSnapshot = await loadRuntimeAppSettingsState();
  if (!runtimeSnapshot) {
    return;
  }

  const merged = { ...localSnapshot, ...normalizeSettingsPayload(runtimeSnapshot) };
  writeWhitelistedLocalSettings(merged);
  await saveRuntimeAppSettingsState(merged);
}
