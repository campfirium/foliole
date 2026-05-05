import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { getCustomInterfaceFont, getCustomMonospaceFont, getCustomUiFont, setCustomInterfaceFont, setCustomMonospaceFont, setCustomUiFont } from './appearanceSettings';

beforeEach(() => {
  window.localStorage.clear();
  window.electronAPI = undefined;
});

it('normalizes legacy Windows registry-like font names when reading custom fonts', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.customUiFont, 'XHei-Believe & XHei-Believe-Bold (TrueType)');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.customInterfaceFont, '@SimSun (TrueType)');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.customMonospaceFont, 'Cascadia Mono (TrueType)');

  expect(getCustomUiFont()).toBe('XHei-Believe');
  expect(getCustomInterfaceFont()).toBe('SimSun');
  expect(getCustomMonospaceFont()).toBe('Cascadia Mono');
});

it('stores normalized font names for new custom selections', () => {
  setCustomUiFont('UD Digi Kyokasho N & UD Digi Kyokasho NP (TrueType)');
  setCustomInterfaceFont('@Microsoft YaHei UI (TrueType)');
  setCustomMonospaceFont('Consolas (TrueType)');

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.customUiFont)).toBe('UD Digi Kyokasho N');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.customInterfaceFont)).toBe('Microsoft YaHei UI');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.customMonospaceFont)).toBe('Consolas');
});
