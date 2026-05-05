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

it('creates startup skeleton layout from app settings', async () => {
  const settings = {
    [APP_SETTINGS_STORAGE_KEYS.listCollapsed]: 'true',
    [APP_SETTINGS_STORAGE_KEYS.listWidth]: '512.4',
    [APP_SETTINGS_STORAGE_KEYS.rightSidebarCollapsed]: 'false',
    [APP_SETTINGS_STORAGE_KEYS.rightSidebarWidth]: '336'
  };

  const { createStartupSkeletonLayoutFromSettings } = await import('./startupSkeletonLayout.js');

  expect(createStartupSkeletonLayoutFromSettings(settings)).toEqual({
    isListCollapsed: true,
    isRightSidebarCollapsed: false,
    listWidth: 512,
    mode: 'light',
    rightSidebarWidth: 336
  });
});

it('creates injected startup css from app settings', async () => {
  const settings = {
    [APP_SETTINGS_STORAGE_KEYS.baseColor]: 'dark',
    [APP_SETTINGS_STORAGE_KEYS.listCollapsed]: 'true',
    [APP_SETTINGS_STORAGE_KEYS.listWidth]: '512',
    [APP_SETTINGS_STORAGE_KEYS.rightSidebarWidth]: '336'
  };

  const { createStartupSkeletonCss, createStartupSkeletonLayoutFromSettings } = await import('./startupSkeletonLayout.js');
  const css = createStartupSkeletonCss(createStartupSkeletonLayoutFromSettings(settings), settings);

  expect(css).toContain('--startup-list-width: 512px;');
  expect(css).toContain('--startup-list-current-width: 0px;');
  expect(css).toContain('--startup-document-bg: #1f211f;');
});

it('falls back to default skeleton widths when app settings are missing', async () => {
  const { createStartupSkeletonLayoutFromSettings } = await import('./startupSkeletonLayout.js');

  expect(createStartupSkeletonLayoutFromSettings({})).toEqual({
    isListCollapsed: false,
    isRightSidebarCollapsed: false,
    listWidth: null,
    mode: 'light',
    rightSidebarWidth: null
  });
});

it('keeps missing layout settings on the renderer default workspace widths', async () => {
  const { createStartupSkeletonCss, createStartupSkeletonLayoutFromSettings } = await import('./startupSkeletonLayout.js');
  const css = createStartupSkeletonCss(createStartupSkeletonLayoutFromSettings({}), {});

  expect(css).not.toContain('--startup-list-width:');
  expect(css).not.toContain('--startup-right-sidebar-width:');
});
