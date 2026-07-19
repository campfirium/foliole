import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../lib/platform/nativeContract';
import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';
import {
  APP_SETTINGS_CLASSIFICATIONS,
  APP_SETTINGS_PERSISTENCE_KINDS
} from '../config/appSettingsClassification';

import {
  getLocalStorageWhitelist,
  RUNTIME_APP_SETTINGS_SAVED_EVENT,
  setWhitelistedLocalStorageItem
} from './storage';

const invoke = vi.fn().mockResolvedValue(null);

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.electronAPI = {
    invoke: invoke as NativeInvoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
});

it('derives localStorage whitelist from settings classification', () => {
  expect(getLocalStorageWhitelist()).toContain(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent);
  expect(getLocalStorageWhitelist()).toContain(APP_SETTINGS_STORAGE_KEYS.searchEnhancementPromptDismissed);
  expect(getLocalStorageWhitelist()).toContain(APP_SETTINGS_STORAGE_KEYS.actionHelpCardsEnabled);
  expect(getLocalStorageWhitelist()).toContain(APP_SETTINGS_STORAGE_KEYS.folioleAideEnabled);
  expect(getLocalStorageWhitelist()).toContain(APP_SETTINGS_STORAGE_KEYS.macOsFontSmoothing);
  expect(getLocalStorageWhitelist()).not.toContain(APP_SETTINGS_STORAGE_KEYS.desktopDeviceSyncEnabled);
});

it('classifies macOS font smoothing as a runtime-mirrored renderer setting', () => {
  expect(APP_SETTINGS_CLASSIFICATIONS.macOsFontSmoothing.kind).toBe(
    APP_SETTINGS_PERSISTENCE_KINDS.runtimeMirroredRendererSnapshot
  );
});

it('classifies the search enhancement prompt as runtime-mirrored, not cross-host sync', () => {
  expect(APP_SETTINGS_CLASSIFICATIONS.searchEnhancementPromptDismissed.kind).toBe(
    APP_SETTINGS_PERSISTENCE_KINDS.runtimeMirroredRendererSnapshot
  );
});

it('classifies Foliole Aide enablement as a runtime-mirrored local setting', () => {
  expect(APP_SETTINGS_CLASSIFICATIONS.folioleAideEnabled.kind).toBe(
    APP_SETTINGS_PERSISTENCE_KINDS.runtimeMirroredRendererSnapshot
  );
});

it('rejects settings that are not classified for localStorage', () => {
  expect(() => setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.desktopDeviceSyncEnabled, 'true')).toThrow(
    '[storage] key is not in localStorage whitelist: foliole-desktop-device-sync-enabled'
  );
});

it('does not persist the runtime snapshot again when the local value is unchanged', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent, '120');

  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent, '120');

  expect(invoke).not.toHaveBeenCalled();
});

it('notifies the current renderer after runtime settings finish saving', async () => {
  const listener = vi.fn();
  window.addEventListener(RUNTIME_APP_SETTINGS_SAVED_EVENT, listener, { once: true });
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.commandShortcutOverrides)).toBeNull();

  setWhitelistedLocalStorageItem(
    APP_SETTINGS_STORAGE_KEYS.commandShortcutOverrides,
    '{"capture.globalToInbox":{"primary":"Alt+C"}}'
  );
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.commandShortcutOverrides)).not.toBeNull();

  await vi.waitFor(() => expect(invoke).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());
});
