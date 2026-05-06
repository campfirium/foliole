import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import { getLocalStorageWhitelist, setWhitelistedLocalStorageItem } from './storage';

vi.mock('./appSettingsState', () => ({
  saveRuntimeAppSettingsState: vi.fn().mockResolvedValue(true)
}));

beforeEach(() => {
  window.localStorage.clear();
});

it('derives localStorage whitelist from settings classification', () => {
  expect(getLocalStorageWhitelist()).toContain(APP_SETTINGS_STORAGE_KEYS.uiFont);
  expect(getLocalStorageWhitelist()).not.toContain(APP_SETTINGS_STORAGE_KEYS.desktopDeviceSyncEnabled);
});

it('rejects settings that are not classified for localStorage', () => {
  expect(() => setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.desktopDeviceSyncEnabled, 'true')).toThrow(
    '[storage] key is not in localStorage whitelist: foliole-desktop-device-sync-enabled'
  );
});
