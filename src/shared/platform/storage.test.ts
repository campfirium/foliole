import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';
import {
  APP_SETTINGS_CLASSIFICATIONS,
  APP_SETTINGS_PERSISTENCE_KINDS
} from '../config/appSettingsClassification';

import { getLocalStorageWhitelist, setWhitelistedLocalStorageItem } from './storage';

vi.mock('./appSettingsState', () => ({
  saveRuntimeAppSettingsState: vi.fn().mockResolvedValue(true)
}));

beforeEach(() => {
  window.localStorage.clear();
});

it('derives localStorage whitelist from settings classification', () => {
  expect(getLocalStorageWhitelist()).toContain(APP_SETTINGS_STORAGE_KEYS.uiFont);
  expect(getLocalStorageWhitelist()).toContain(APP_SETTINGS_STORAGE_KEYS.searchEnhancementPromptDismissed);
  expect(getLocalStorageWhitelist()).not.toContain(APP_SETTINGS_STORAGE_KEYS.desktopDeviceSyncEnabled);
});

it('classifies the search enhancement prompt as runtime-mirrored, not cross-host sync', () => {
  expect(APP_SETTINGS_CLASSIFICATIONS.searchEnhancementPromptDismissed.kind).toBe(
    APP_SETTINGS_PERSISTENCE_KINDS.runtimeMirroredRendererSnapshot
  );
});

it('rejects settings that are not classified for localStorage', () => {
  expect(() => setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.desktopDeviceSyncEnabled, 'true')).toThrow(
    '[storage] key is not in localStorage whitelist: foliole-desktop-device-sync-enabled'
  );
});
