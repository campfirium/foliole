import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import {
  getExternalFoldersEnabled,
  normalizeExternalFoldersEnabled,
  setExternalFoldersEnabled
} from './externalFoldersSettings';

beforeEach(() => {
  window.localStorage.clear();
});

it('defaults external folders to enabled', () => {
  expect(getExternalFoldersEnabled()).toBe(true);
});

it('persists the disabled state for cold reads', () => {
  setExternalFoldersEnabled(false);

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.externalFoldersEnabled)).toBe('false');
  expect(getExternalFoldersEnabled()).toBe(false);
});

it('falls back to enabled for invalid stored values', () => {
  expect(normalizeExternalFoldersEnabled('later')).toBe(true);
});
