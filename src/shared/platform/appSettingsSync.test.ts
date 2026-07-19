import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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
  document.documentElement.style.removeProperty('-webkit-font-smoothing');
});

afterEach(() => vi.restoreAllMocks());

it('hydrates local settings from the runtime startup snapshot without rewriting it', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.interfaceFontSize, '17');
  const invoke = vi
    .fn()
    .mockResolvedValueOnce({
      [APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent]: '120',
      [APP_SETTINGS_STORAGE_KEYS.interfaceFontSize]: '19'
    })
    .mockResolvedValueOnce(null);
  window.electronAPI = createMockElectronApi(invoke);

  await syncAppSettingsWithRuntime();

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent)).toBe('120');
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
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent, '110');
  const invoke = vi.fn().mockResolvedValueOnce({});
  window.electronAPI = createMockElectronApi(invoke);

  await syncAppSettingsWithRuntime();

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent)).toBe('110');
  expect(invoke).toHaveBeenCalledWith('load_app_settings_state');
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('applies local startup skeleton colors before waiting for the runtime snapshot', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.baseColor, 'dark');
  const invoke = vi.fn(() => new Promise(() => undefined));
  window.electronAPI = createMockElectronApi(invoke);

  void syncAppSettingsWithRuntime();
  await Promise.resolve();

  expect(document.documentElement.dataset.resolvedBaseColor).toBe('dark');
  expect(document.documentElement.style.getPropertyValue('--startup-region-main-document-bg')).toBe('#161918');
});

it('applies runtime startup skeleton colors before the app mounts', async () => {
  const invoke = vi.fn().mockResolvedValueOnce({
    [APP_SETTINGS_STORAGE_KEYS.baseColor]: 'dark',
    [APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePaletteDark]: '["#111111","#222222","#333333","#444444","#555555"]',
    [APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAssignmentsDark]: '{"main-document":3}'
  });
  window.electronAPI = createMockElectronApi(invoke);

  await syncAppSettingsWithRuntime();

  expect(document.documentElement.dataset.resolvedBaseColor).toBe('dark');
  expect(document.documentElement.style.getPropertyValue('--startup-region-main-document-bg')).toBe('#444444');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.baseColor)).toBe('dark');
});

it('applies default macOS font smoothing before the theme settings are available', async () => {
  vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel');
  const invoke = vi.fn(() => new Promise(() => undefined));
  window.electronAPI = createMockElectronApi(invoke);

  void syncAppSettingsWithRuntime();
  await Promise.resolve();

  expect(document.documentElement.style.getPropertyValue('-webkit-font-smoothing')).toBe('antialiased');
});

it('lets the runtime snapshot disable a local macOS font smoothing override', async () => {
  vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.macOsFontSmoothing, 'true');
  const invoke = vi.fn().mockResolvedValueOnce({
    [APP_SETTINGS_STORAGE_KEYS.macOsFontSmoothing]: 'false'
  });
  window.electronAPI = createMockElectronApi(invoke);

  await syncAppSettingsWithRuntime();

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.macOsFontSmoothing)).toBe('false');
  expect(document.documentElement.style.getPropertyValue('-webkit-font-smoothing')).toBe('');
});
