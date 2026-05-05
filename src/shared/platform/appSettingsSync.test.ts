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
  window.electronAPI = undefined;
});

it('hydrates local settings from runtime snapshot without writing during startup', async () => {
  const invoke = vi
    .fn()
    .mockResolvedValueOnce({
      [APP_SETTINGS_STORAGE_KEYS.uiFont]: 'inter',
      [APP_SETTINGS_STORAGE_KEYS.interfaceFontSize]: '19'
    });
  window.electronAPI = createMockElectronApi(invoke);

  await syncAppSettingsWithRuntime();

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.uiFont)).toBe('inter');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.interfaceFontSize)).toBe('19');
  expect(invoke).toHaveBeenCalledOnce();
  expect(invoke).toHaveBeenCalledWith('load_app_settings_state');
});

it('does not migrate existing local values during startup sync', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.uiFont, 'source-sans');
  const invoke = vi.fn().mockResolvedValueOnce({});
  window.electronAPI = createMockElectronApi(invoke);

  await syncAppSettingsWithRuntime();

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.uiFont)).toBe('source-sans');
  expect(invoke).toHaveBeenCalledOnce();
  expect(invoke).toHaveBeenCalledWith('load_app_settings_state');
});
