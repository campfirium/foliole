import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../lib/platform/nativeContract';
import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import { syncAppSettingsWithRuntime } from './appSettingsSync';

function createMockElectronApi(invoke: NativeInvoke) {
  return {
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
}

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
});

it('hydrates local settings from the runtime startup snapshot without rewriting it', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.interfaceFontSize, '17');
  const invoke = vi
    .fn()
    .mockResolvedValueOnce({
      [APP_SETTINGS_STORAGE_KEYS.uiFont]: 'inter',
      [APP_SETTINGS_STORAGE_KEYS.interfaceFontSize]: '19'
    })
    .mockResolvedValueOnce(null);
  window.electronAPI = createMockElectronApi(invoke);

  await syncAppSettingsWithRuntime();

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.uiFont)).toBe('inter');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.interfaceFontSize)).toBe('19');
  expect(invoke).toHaveBeenCalledWith('load_app_settings_state');
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('does not rewrite the runtime startup snapshot when a single runtime setting wins', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.interfaceFontSize, '17');
  const invoke = vi.fn().mockResolvedValueOnce({
    [APP_SETTINGS_STORAGE_KEYS.interfaceFontSize]: '19'
  });
  window.electronAPI = createMockElectronApi(invoke);

  await syncAppSettingsWithRuntime();

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.interfaceFontSize)).toBe('19');
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith('load_app_settings_state');
});

it('keeps existing local values without writing runtime when the runtime startup snapshot is empty', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.uiFont, 'source-sans');
  const invoke = vi.fn().mockResolvedValueOnce({});
  window.electronAPI = createMockElectronApi(invoke);

  await syncAppSettingsWithRuntime();

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.uiFont)).toBe('source-sans');
  expect(invoke).toHaveBeenCalledWith('load_app_settings_state');
  expect(invoke).toHaveBeenCalledTimes(1);
});
