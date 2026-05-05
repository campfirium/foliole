import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import { syncAppSettingsWithRuntime } from './appSettingsSync';

function createMockElectronApi(invoke: ReturnType<typeof vi.fn>) {
  return {
    invoke,
    on: () => () => undefined,
    windowControls: {
      close: async () => undefined,
      isMaximized: async () => false,
      minimize: async () => undefined,
      onResized: () => () => undefined,
      toggleMaximize: async () => undefined
    }
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.electronAPI = undefined;
});

it('hydrates local settings from runtime snapshot and persists merged state back', async () => {
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
  expect(invoke).toHaveBeenNthCalledWith(1, 'load_app_settings_state');
  expect(invoke).toHaveBeenNthCalledWith(2, 'save_app_settings_state', {
    settings: {
      [APP_SETTINGS_STORAGE_KEYS.uiFont]: 'inter',
      [APP_SETTINGS_STORAGE_KEYS.interfaceFontSize]: '19'
    }
  });
});

it('migrates existing local values into runtime when runtime snapshot is empty', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.uiFont, 'source-sans');
  const invoke = vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce(null);
  window.electronAPI = createMockElectronApi(invoke);

  await syncAppSettingsWithRuntime();

  expect(invoke).toHaveBeenNthCalledWith(2, 'save_app_settings_state', {
    settings: {
      [APP_SETTINGS_STORAGE_KEYS.uiFont]: 'source-sans'
    }
  });
});
