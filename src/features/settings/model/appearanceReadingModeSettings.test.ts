import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import {
  getBaseColorMode,
  getImmersiveDoubleClickEditEnabled,
  setImmersiveDoubleClickEditEnabled
} from './appearanceReadingModeSettings';

beforeEach(() => {
  window.localStorage.clear();
});

it('defaults the base color mode to the system preference', () => {
  expect(getBaseColorMode()).toBe('system');
});

it('preserves an explicitly saved base color mode', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.baseColor, 'light');

  expect(getBaseColorMode()).toBe('light');
});

it('falls back to the system preference for an invalid saved value', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.baseColor, 'invalid');

  expect(getBaseColorMode()).toBe('system');
});

it('defaults immersive reading double-click editing on and persists an explicit opt-out', () => {
  expect(getImmersiveDoubleClickEditEnabled()).toBe(true);

  setImmersiveDoubleClickEditEnabled(false);

  expect(getImmersiveDoubleClickEditEnabled()).toBe(false);
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.immersiveDoubleClickEditEnabled)).toBe('false');
});
