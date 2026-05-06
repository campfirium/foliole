import { loadRuntimeAppSettingsState } from './appSettingsState';
import { getLocalStorageWhitelist } from './storage';

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
  if (typeof window === 'undefined') {
    return;
  }
  for (const key of getLocalStorageWhitelist()) {
    const value = settings[key];
    if (typeof value === 'string') {
      window.localStorage.setItem(key, value);
    }
  }
}

export async function syncAppSettingsWithRuntime() {
  const runtimeSnapshot = await loadRuntimeAppSettingsState();
  if (!runtimeSnapshot) {
    return;
  }

  writeWhitelistedLocalSettings(normalizeSettingsPayload(runtimeSnapshot));
}
