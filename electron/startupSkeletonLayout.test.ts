// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../src/shared/config/appSettings.js';

const mocks = vi.hoisted(() => ({
  loadJsonSetting: vi.fn()
}));

vi.mock('./database/settingsStore.js', () => ({
  loadJsonSetting: mocks.loadJsonSetting
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

it('loads startup skeleton layout from existing app settings', async () => {
  mocks.loadJsonSetting.mockReturnValue({
    [APP_SETTINGS_STORAGE_KEYS.listCollapsed]: 'true',
    [APP_SETTINGS_STORAGE_KEYS.listWidth]: '512.4',
    [APP_SETTINGS_STORAGE_KEYS.rightSidebarCollapsed]: 'false',
    [APP_SETTINGS_STORAGE_KEYS.rightSidebarWidth]: '336'
  });

  const { loadStartupSkeletonLayout } = await import('./startupSkeletonLayout.js');

  expect(loadStartupSkeletonLayout()).toEqual({
    isListCollapsed: true,
    isRightSidebarCollapsed: false,
    listWidth: 512,
    mode: 'light',
    rightSidebarWidth: 336
  });
});

it('creates injected startup css from existing app settings', async () => {
  mocks.loadJsonSetting.mockReturnValue({
    [APP_SETTINGS_STORAGE_KEYS.baseColor]: 'dark',
    [APP_SETTINGS_STORAGE_KEYS.listCollapsed]: 'true',
    [APP_SETTINGS_STORAGE_KEYS.listWidth]: '512',
    [APP_SETTINGS_STORAGE_KEYS.rightSidebarWidth]: '336'
  });

  const { loadStartupSkeletonCss } = await import('./startupSkeletonLayout.js');

  expect(loadStartupSkeletonCss()).toContain('--startup-list-width: 512px;');
  expect(loadStartupSkeletonCss()).toContain('--startup-list-current-width: 0px;');
  expect(loadStartupSkeletonCss()).toContain('--startup-document-bg: #1f211f;');
});

it('falls back to default skeleton widths when app settings cannot be read', async () => {
  mocks.loadJsonSetting.mockImplementation(() => {
    throw new Error('settings table unavailable');
  });

  const { loadStartupSkeletonLayout } = await import('./startupSkeletonLayout.js');

  expect(loadStartupSkeletonLayout()).toEqual({
    isListCollapsed: false,
    isRightSidebarCollapsed: false,
    listWidth: null,
    mode: 'light',
    rightSidebarWidth: null
  });
});
