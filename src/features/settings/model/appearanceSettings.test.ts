import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import {
  getClozeColorPreset,
  getCustomInterfaceFont,
  getCustomMonospaceFont,
  getCustomUiFont,
  getHighlightColorPreset,
  getSelectionColorPreset,
  setCustomInterfaceFont,
  setCustomMonospaceFont,
  setCustomUiFont
} from './appearanceSettings';

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

it('maps legacy green highlight default to the current text-color default', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.highlightColor, '#3f8f68');
  expect(getHighlightColorPreset()).toBe('#38bdf8');
});

it('falls back to dedicated defaults for selection and cloze colors', () => {
  expect(getSelectionColorPreset()).toBe('#3876ff');
  expect(getClozeColorPreset()).toBe('#facc15');
});
