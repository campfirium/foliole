import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { getBaseColorMode } from './appearanceReadingModeSettings';

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
