import { createSyncParticipationSnapshot } from '../../lib/platform/syncParticipationContract.js';
import { APP_SETTINGS_STORAGE_KEYS } from '../../src/shared/config/appSettings.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

const APP_SETTINGS_KEY = 'app_settings';

function loadAppSettingsRecord(): Record<string, string> {
  const payload = loadJsonSetting(APP_SETTINGS_KEY);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (typeof value === 'string') {
      normalized[key] = value;
    }
  }
  return normalized;
}

export function isDesktopCompanionSyncEnabled() {
  return loadAppSettingsRecord()[APP_SETTINGS_STORAGE_KEYS.desktopDeviceSyncEnabled] === 'true';
}

export function isDesktopCompanionSyncPaused() {
  return loadAppSettingsRecord()[APP_SETTINGS_STORAGE_KEYS.desktopDeviceSyncPaused] === 'true';
}

export function loadDesktopCompanionSyncParticipation() {
  return createSyncParticipationSnapshot({
    lifecycle_active: true,
    sync_enabled: isDesktopCompanionSyncEnabled(),
    sync_paused: isDesktopCompanionSyncPaused()
  });
}

export function isDesktopCompanionSyncParticipating() {
  return loadDesktopCompanionSyncParticipation().participating;
}

export function setDesktopCompanionSyncEnabled(enabled: boolean) {
  const nextSettings = loadAppSettingsRecord();
  nextSettings[APP_SETTINGS_STORAGE_KEYS.desktopDeviceSyncEnabled] = enabled ? 'true' : 'false';
  saveJsonSetting(APP_SETTINGS_KEY, nextSettings);
}

export function setDesktopCompanionSyncPaused(paused: boolean) {
  const nextSettings = loadAppSettingsRecord();
  nextSettings[APP_SETTINGS_STORAGE_KEYS.desktopDeviceSyncPaused] = paused ? 'true' : 'false';
  saveJsonSetting(APP_SETTINGS_KEY, nextSettings);
}
