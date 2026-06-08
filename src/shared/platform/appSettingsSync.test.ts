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

it('hydrates local settings from runtime snapshot and writes the merged startup snapshot back', async () => {
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
  expect(invoke).toHaveBeenCalledWith('save_app_settings_state', {
    settings: {
      [APP_SETTINGS_STORAGE_KEYS.uiFont]: 'inter',
      [APP_SETTINGS_STORAGE_KEYS.interfaceFontSize]: '19'
    }
  });
});

it('writes existing local values back when the runtime startup snapshot is empty', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.uiFont, 'source-sans');
  const invoke = vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce(null);
  window.electronAPI = createMockElectronApi(invoke);

  await syncAppSettingsWithRuntime();

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.uiFont)).toBe('source-sans');
  expect(invoke).toHaveBeenCalledWith('load_app_settings_state');
  expect(invoke).toHaveBeenCalledWith('save_app_settings_state', {
    settings: {
      [APP_SETTINGS_STORAGE_KEYS.uiFont]: 'source-sans'
    }
  });
});
