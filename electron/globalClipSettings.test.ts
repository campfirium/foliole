import { beforeEach, expect, it, vi } from 'vitest';

const { loadJsonSetting } = vi.hoisted(() => ({
  loadJsonSetting: vi.fn()
}));

vi.mock('./database/settingsStore.js', () => ({ loadJsonSetting }));

import { APP_SETTINGS_STORAGE_KEYS } from '../src/shared/config/appSettings.js';

import {
  getGlobalClipToastPosition,
  isExistingClipboardFallbackEnabled,
  resolveGlobalClipToastPosition
} from './globalClipSettings.js';

beforeEach(() => {
  loadJsonSetting.mockReset();
  loadJsonSetting.mockReturnValue(null);
});

it('enables existing clipboard fallback by default', () => {
  expect(isExistingClipboardFallbackEnabled()).toBe(true);
});

it('disables existing clipboard fallback only when the setting is false', () => {
  loadJsonSetting.mockReturnValue({
    [APP_SETTINGS_STORAGE_KEYS.globalClipExistingClipboardFallbackEnabled]: 'false'
  });

  expect(isExistingClipboardFallbackEnabled()).toBe(false);
});

it('keeps existing clipboard fallback enabled for malformed values', () => {
  loadJsonSetting.mockReturnValue({
    [APP_SETTINGS_STORAGE_KEYS.globalClipExistingClipboardFallbackEnabled]: 'maybe'
  });

  expect(isExistingClipboardFallbackEnabled()).toBe(true);
});

it('defaults capture confirmations to the top right only on macOS', () => {
  expect(resolveGlobalClipToastPosition(undefined, 'darwin')).toBe('top-right');
  expect(resolveGlobalClipToastPosition(undefined, 'win32')).toBe('bottom-right');
  expect(resolveGlobalClipToastPosition('top-right', 'linux')).toBe('bottom-right');
});

it('loads an explicit macOS capture confirmation position', () => {
  loadJsonSetting.mockReturnValue({
    [APP_SETTINGS_STORAGE_KEYS.globalClipToastPosition]: 'bottom-right'
  });

  expect(getGlobalClipToastPosition('darwin')).toBe('bottom-right');
});
