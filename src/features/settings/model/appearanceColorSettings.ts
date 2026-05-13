import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import {
  DEFAULT_APPEARANCE_COLORS,
  deriveMutedForegroundRgb,
  getClozeSurfaceAlpha,
  getHighlightSurfaceAlpha,
  getSelectionSurfaceAlpha,
  hexColorToRgbChannels
} from '../../../shared/config/defaultAppearanceColors';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

export type AccentColorPreset = string;
export type FontColorPreset = string;
export type SelectionColorPreset = string;
export type HighlightColorPreset = string;
export type ClozeColorPreset = string;
export type AppearanceResolvedColorMode = 'dark' | 'light';

export const DEFAULT_FONT_COLOR_PRESET: FontColorPreset = DEFAULT_APPEARANCE_COLORS.light.font;
export const DEFAULT_ACCENT_COLOR_PRESET: AccentColorPreset = DEFAULT_APPEARANCE_COLORS.light.accent;
export const DEFAULT_SELECTION_COLOR_PRESET: SelectionColorPreset = DEFAULT_APPEARANCE_COLORS.light.selection;
export const DEFAULT_HIGHLIGHT_COLOR_PRESET: HighlightColorPreset = DEFAULT_APPEARANCE_COLORS.light.highlight;
export const DEFAULT_CLOZE_COLOR_PRESET: ClozeColorPreset = DEFAULT_APPEARANCE_COLORS.light.cloze;
export const DEFAULT_DARK_FONT_COLOR_PRESET: FontColorPreset = DEFAULT_APPEARANCE_COLORS.dark.font;
export const DEFAULT_DARK_ACCENT_COLOR_PRESET: AccentColorPreset = DEFAULT_APPEARANCE_COLORS.dark.accent;
export const DEFAULT_DARK_SELECTION_COLOR_PRESET: SelectionColorPreset = DEFAULT_APPEARANCE_COLORS.dark.selection;
export const DEFAULT_DARK_HIGHLIGHT_COLOR_PRESET: HighlightColorPreset = DEFAULT_APPEARANCE_COLORS.dark.highlight;
export const DEFAULT_DARK_CLOZE_COLOR_PRESET: ClozeColorPreset = DEFAULT_APPEARANCE_COLORS.dark.cloze;

const LEGACY_DEFAULT_HIGHLIGHT_COLOR_PRESETS = new Set<string>(['#3f8f68', '#202124']);

const COLOR_STORAGE_KEYS = {
  fontColor: APP_SETTINGS_STORAGE_KEYS.fontColor,
  fontColorDark: APP_SETTINGS_STORAGE_KEYS.fontColorDark,
  accentColor: APP_SETTINGS_STORAGE_KEYS.accentColor,
  accentColorDark: APP_SETTINGS_STORAGE_KEYS.accentColorDark,
  selectionColor: APP_SETTINGS_STORAGE_KEYS.selectionColor,
  selectionColorDark: APP_SETTINGS_STORAGE_KEYS.selectionColorDark,
  highlightColor: APP_SETTINGS_STORAGE_KEYS.highlightColor,
  highlightColorDark: APP_SETTINGS_STORAGE_KEYS.highlightColorDark,
  clozeColor: APP_SETTINGS_STORAGE_KEYS.clozeColor,
  clozeColorDark: APP_SETTINGS_STORAGE_KEYS.clozeColorDark
} as const;

function colorStorageKey(lightKey: string, darkKey: string, mode: AppearanceResolvedColorMode) {
  return mode === 'dark' ? darkKey : lightKey;
}

function normalizeHexColor(value: string, fallback: string): string {
  const trimmed = value.trim();
  const match = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
  return match?.[1] ? `#${match[1].toLowerCase()}` : fallback;
}

function normalizeAccentColor(value: string): string {
  return normalizeHexColor(value, DEFAULT_ACCENT_COLOR_PRESET);
}

function normalizeFontColor(value: string): string {
  return normalizeHexColor(value, DEFAULT_FONT_COLOR_PRESET);
}

function normalizeSelectionColor(value: string): string {
  return normalizeHexColor(value, DEFAULT_SELECTION_COLOR_PRESET);
}

function normalizeHighlightColor(value: string): string {
  return normalizeHexColor(value, DEFAULT_HIGHLIGHT_COLOR_PRESET);
}

function normalizeClozeColor(value: string): string {
  return normalizeHexColor(value, DEFAULT_CLOZE_COLOR_PRESET);
}

function getDefaultAccentColor(mode: AppearanceResolvedColorMode) {
  return mode === 'dark' ? DEFAULT_DARK_ACCENT_COLOR_PRESET : DEFAULT_ACCENT_COLOR_PRESET;
}

function getDefaultFontColor(mode: AppearanceResolvedColorMode) {
  return mode === 'dark' ? DEFAULT_DARK_FONT_COLOR_PRESET : DEFAULT_FONT_COLOR_PRESET;
}

function getDefaultSelectionColor(mode: AppearanceResolvedColorMode) {
  return mode === 'dark' ? DEFAULT_DARK_SELECTION_COLOR_PRESET : DEFAULT_SELECTION_COLOR_PRESET;
}

function getDefaultHighlightColor(mode: AppearanceResolvedColorMode) {
  return mode === 'dark' ? DEFAULT_DARK_HIGHLIGHT_COLOR_PRESET : DEFAULT_HIGHLIGHT_COLOR_PRESET;
}

function getDefaultClozeColor(mode: AppearanceResolvedColorMode) {
  return mode === 'dark' ? DEFAULT_DARK_CLOZE_COLOR_PRESET : DEFAULT_CLOZE_COLOR_PRESET;
}

function getTextSelectionBackgroundColor(selectionColor: string, mode: AppearanceResolvedColorMode) {
  return mode === 'dark'
    ? `color-mix(in srgb, ${selectionColor} 50%, rgb(var(--color-background)) 50%)`
    : `rgb(var(--app-selection-color-rgb) / ${getSelectionSurfaceAlpha(mode)})`;
}

function getSelectionForegroundColor(mode: AppearanceResolvedColorMode) {
  return mode === 'dark' ? '#ffffff' : 'rgb(var(--color-foreground))';
}

export function getFontColorPreset(mode: AppearanceResolvedColorMode = 'light'): FontColorPreset {
  const raw = getWhitelistedLocalStorageItem(
    colorStorageKey(COLOR_STORAGE_KEYS.fontColor, COLOR_STORAGE_KEYS.fontColorDark, mode)
  );
  return raw ? normalizeFontColor(raw) : getDefaultFontColor(mode);
}

export function setFontColorPreset(value: FontColorPreset, mode: AppearanceResolvedColorMode = 'light') {
  setWhitelistedLocalStorageItem(
    colorStorageKey(COLOR_STORAGE_KEYS.fontColor, COLOR_STORAGE_KEYS.fontColorDark, mode),
    normalizeFontColor(value)
  );
}

export function getAccentColorPreset(mode: AppearanceResolvedColorMode = 'light'): AccentColorPreset {
  const raw = getWhitelistedLocalStorageItem(
    colorStorageKey(COLOR_STORAGE_KEYS.accentColor, COLOR_STORAGE_KEYS.accentColorDark, mode)
  );
  return raw ? normalizeAccentColor(raw) : getDefaultAccentColor(mode);
}

export function setAccentColorPreset(value: AccentColorPreset, mode: AppearanceResolvedColorMode = 'light') {
  setWhitelistedLocalStorageItem(
    colorStorageKey(COLOR_STORAGE_KEYS.accentColor, COLOR_STORAGE_KEYS.accentColorDark, mode),
    normalizeAccentColor(value)
  );
}

export function getSelectionColorPreset(mode: AppearanceResolvedColorMode = 'light'): SelectionColorPreset {
  const raw = getWhitelistedLocalStorageItem(
    colorStorageKey(COLOR_STORAGE_KEYS.selectionColor, COLOR_STORAGE_KEYS.selectionColorDark, mode)
  );
  return raw ? normalizeSelectionColor(raw) : getDefaultSelectionColor(mode);
}

export function setSelectionColorPreset(value: SelectionColorPreset, mode: AppearanceResolvedColorMode = 'light') {
  setWhitelistedLocalStorageItem(
    colorStorageKey(COLOR_STORAGE_KEYS.selectionColor, COLOR_STORAGE_KEYS.selectionColorDark, mode),
    normalizeSelectionColor(value)
  );
}

export function getHighlightColorPreset(mode: AppearanceResolvedColorMode = 'light'): HighlightColorPreset {
  const raw = getWhitelistedLocalStorageItem(
    colorStorageKey(COLOR_STORAGE_KEYS.highlightColor, COLOR_STORAGE_KEYS.highlightColorDark, mode)
  );
  if (!raw) {
    return getDefaultHighlightColor(mode);
  }
  const normalized = normalizeHighlightColor(raw);
  return LEGACY_DEFAULT_HIGHLIGHT_COLOR_PRESETS.has(normalized)
    ? getDefaultHighlightColor(mode)
    : normalized;
}

export function setHighlightColorPreset(value: HighlightColorPreset, mode: AppearanceResolvedColorMode = 'light') {
  setWhitelistedLocalStorageItem(
    colorStorageKey(COLOR_STORAGE_KEYS.highlightColor, COLOR_STORAGE_KEYS.highlightColorDark, mode),
    normalizeHighlightColor(value)
  );
}

export function getClozeColorPreset(mode: AppearanceResolvedColorMode = 'light'): ClozeColorPreset {
  const raw = getWhitelistedLocalStorageItem(
    colorStorageKey(COLOR_STORAGE_KEYS.clozeColor, COLOR_STORAGE_KEYS.clozeColorDark, mode)
  );
  return raw ? normalizeClozeColor(raw) : getDefaultClozeColor(mode);
}

export function setClozeColorPreset(value: ClozeColorPreset, mode: AppearanceResolvedColorMode = 'light') {
  setWhitelistedLocalStorageItem(
    colorStorageKey(COLOR_STORAGE_KEYS.clozeColor, COLOR_STORAGE_KEYS.clozeColorDark, mode),
    normalizeClozeColor(value)
  );
}

interface ApplyAppearanceColorSettingsInput {
  accentColor: AccentColorPreset;
  clozeColor: ClozeColorPreset;
  fontColor: FontColorPreset;
  highlightColor: HighlightColorPreset;
  mode: AppearanceResolvedColorMode;
  selectionColor: SelectionColorPreset;
}

export function applyAppearanceColorSettings(root: HTMLElement, input: ApplyAppearanceColorSettingsInput) {
  const normalizedAccentColor = normalizeAccentColor(input.accentColor);
  const normalizedFontColor = normalizeFontColor(input.fontColor);
  const normalizedSelectionColor = normalizeSelectionColor(input.selectionColor);
  const normalizedHighlightColor = normalizeHighlightColor(input.highlightColor);
  const normalizedClozeColor = normalizeClozeColor(input.clozeColor);
  const accentRgb = hexColorToRgbChannels(normalizedAccentColor);
  const fontRgb = hexColorToRgbChannels(normalizedFontColor);
  const selectionRgb = hexColorToRgbChannels(normalizedSelectionColor);
  const highlightRgb = hexColorToRgbChannels(normalizedHighlightColor);
  const clozeRgb = hexColorToRgbChannels(normalizedClozeColor);

  root.style.setProperty('--color-foreground', fontRgb);
  root.style.setProperty('--color-muted-foreground', deriveMutedForegroundRgb(fontRgb, input.mode));
  root.style.setProperty('--app-accent-color', normalizedAccentColor);
  root.style.setProperty('--app-accent-color-rgb', accentRgb);
  root.style.setProperty('--app-selection-color', normalizedSelectionColor);
  root.style.setProperty('--app-selection-color-rgb', selectionRgb);
  root.style.setProperty('--app-text-selection-bg-color', getTextSelectionBackgroundColor(normalizedSelectionColor, input.mode));
  root.style.setProperty('--app-text-selection-fg-color', getSelectionForegroundColor(input.mode));
  root.style.setProperty('--app-selection-foreground-color', getSelectionForegroundColor(input.mode));
  root.style.setProperty('--app-selection-surface-color', `rgb(${selectionRgb} / ${getSelectionSurfaceAlpha(input.mode)})`);
  root.style.setProperty('--app-highlight-color', normalizedHighlightColor);
  root.style.setProperty('--app-highlight-color-rgb', highlightRgb);
  root.style.setProperty('--app-highlight-surface-color', `rgb(${highlightRgb} / ${getHighlightSurfaceAlpha(input.mode)})`);
  root.style.setProperty('--app-cloze-color', normalizedClozeColor);
  root.style.setProperty('--app-cloze-color-rgb', clozeRgb);
  root.style.setProperty('--app-cloze-surface-color', `rgb(${clozeRgb} / ${getClozeSurfaceAlpha(input.mode)})`);
}
