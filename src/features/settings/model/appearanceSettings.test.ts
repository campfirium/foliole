import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import {
  applyAppearanceColorSettings,
  DEFAULT_DARK_CLOZE_COLOR_PRESET,
  DEFAULT_DARK_FONT_COLOR_PRESET,
  DEFAULT_DARK_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_DARK_SELECTION_COLOR_PRESET
} from './appearanceColorSettings';
import {
  getClozeColorPreset,
  getFontColorPreset,
  getCustomInterfaceFont,
  getCustomMonospaceFont,
  getCustomUiFont,
  getHighlightColorPreset,
  getReadingLineHeight,
  getSelectionColorPreset,
  setCustomInterfaceFont,
  setCustomMonospaceFont,
  setCustomUiFont,
  setReadingLineHeight
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

it('stores reading line height presets and ignores unknown values', () => {
  expect(getReadingLineHeight()).toBe('standard');

  setReadingLineHeight('relaxed');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.readingLineHeight)).toBe('relaxed');
  expect(getReadingLineHeight()).toBe('relaxed');

  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.readingLineHeight, '1.72');
  expect(getReadingLineHeight()).toBe('standard');
});

it('uses dedicated dark defaults for reading colors', () => {
  expect(getFontColorPreset('dark')).toBe(DEFAULT_DARK_FONT_COLOR_PRESET);
  expect(getSelectionColorPreset('dark')).toBe(DEFAULT_DARK_SELECTION_COLOR_PRESET);
  expect(getHighlightColorPreset('dark')).toBe(DEFAULT_DARK_HIGHLIGHT_COLOR_PRESET);
  expect(getClozeColorPreset('dark')).toBe(DEFAULT_DARK_CLOZE_COLOR_PRESET);
});

it('applies mode-specific reading mark surface tokens', () => {
  const root = document.documentElement;

  applyAppearanceColorSettings(root, {
    accentColor: '#7fb18d',
    clozeColor: DEFAULT_DARK_CLOZE_COLOR_PRESET,
    fontColor: DEFAULT_DARK_FONT_COLOR_PRESET,
    highlightColor: DEFAULT_DARK_HIGHLIGHT_COLOR_PRESET,
    mode: 'dark',
    selectionColor: DEFAULT_DARK_SELECTION_COLOR_PRESET
  });

  expect(root.style.getPropertyValue('--app-text-selection-bg-color')).toBe('color-mix(in srgb, #78a6ff 50%, rgb(var(--color-background)) 50%)');
  expect(root.style.getPropertyValue('--app-text-selection-fg-color')).toBe('#ffffff');
  expect(root.style.getPropertyValue('--app-selection-foreground-color')).toBe('#ffffff');
  expect(root.style.getPropertyValue('--app-selection-surface-color')).toBe('rgb(120 166 255 / 0.42)');
  expect(root.style.getPropertyValue('--app-highlight-surface-color')).toBe('rgb(92 200 243 / 0.28)');
  expect(root.style.getPropertyValue('--app-cloze-surface-color')).toBe('rgb(225 193 90 / 0.24)');
});
