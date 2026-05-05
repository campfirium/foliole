import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

export type AccentColorPreset = string;
export type FontColorPreset = string;
export type SelectionColorPreset = string;
export type HighlightColorPreset = string;
export type ClozeColorPreset = string;
export type AppearanceResolvedColorMode = 'dark' | 'light';

export const DEFAULT_FONT_COLOR_PRESET: FontColorPreset = '#202124';
export const DEFAULT_ACCENT_COLOR_PRESET: AccentColorPreset = '#3f8f68';
export const DEFAULT_SELECTION_COLOR_PRESET: SelectionColorPreset = '#3876ff';
export const DEFAULT_HIGHLIGHT_COLOR_PRESET: HighlightColorPreset = '#38bdf8';
export const DEFAULT_CLOZE_COLOR_PRESET: ClozeColorPreset = '#facc15';
export const DEFAULT_DARK_FONT_COLOR_PRESET: FontColorPreset = '#e8e6df';
export const DEFAULT_DARK_ACCENT_COLOR_PRESET: AccentColorPreset = '#7fb18d';
export const DEFAULT_DARK_SELECTION_COLOR_PRESET: SelectionColorPreset = '#78a6ff';
export const DEFAULT_DARK_HIGHLIGHT_COLOR_PRESET: HighlightColorPreset = '#5cc8f3';
export const DEFAULT_DARK_CLOZE_COLOR_PRESET: ClozeColorPreset = '#e1c15a';

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
  return match ? `#${match[1].toLowerCase()}` : fallback;
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

function toColorRgb(value: string): string {
  const red = Number.parseInt(value.slice(1, 3), 16);
  const green = Number.parseInt(value.slice(3, 5), 16);
  const blue = Number.parseInt(value.slice(5, 7), 16);
  return `${red} ${green} ${blue}`;
}

function rgbStringToTuple(value: string) {
  return value.split(' ').map((channel) => Number(channel)) as [number, number, number];
}

function blendRgb(sourceRgb: string, targetRgb: string, sourceWeight: number) {
  const source = rgbStringToTuple(sourceRgb);
  const target = rgbStringToTuple(targetRgb);
  return source.map((channel, index) => Math.round(channel * sourceWeight + target[index]! * (1 - sourceWeight))).join(' ');
}

function deriveMutedForegroundRgb(fontRgb: string, mode: AppearanceResolvedColorMode) {
  const canvasRgb = mode === 'dark' ? '24 25 24' : '255 255 255';
  return blendRgb(fontRgb, canvasRgb, mode === 'dark' ? 0.68 : 0.72);
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
  const accentRgb = toColorRgb(normalizedAccentColor);
  const fontRgb = toColorRgb(normalizedFontColor);
  const selectionRgb = toColorRgb(normalizedSelectionColor);
  const highlightRgb = toColorRgb(normalizedHighlightColor);
  const clozeRgb = toColorRgb(normalizedClozeColor);

  root.style.setProperty('--color-foreground', fontRgb);
  root.style.setProperty('--color-muted-foreground', deriveMutedForegroundRgb(fontRgb, input.mode));
  root.style.setProperty('--app-accent-color', normalizedAccentColor);
  root.style.setProperty('--app-accent-color-rgb', accentRgb);
  root.style.setProperty('--app-selection-color', normalizedSelectionColor);
  root.style.setProperty('--app-selection-color-rgb', selectionRgb);
  root.style.setProperty('--app-selection-surface-color', `rgb(${selectionRgb} / 0.34)`);
  root.style.setProperty('--app-highlight-color', normalizedHighlightColor);
  root.style.setProperty('--app-highlight-color-rgb', highlightRgb);
  root.style.setProperty('--app-highlight-surface-color', `rgb(${highlightRgb} / 0.34)`);
  root.style.setProperty('--app-cloze-color', normalizedClozeColor);
  root.style.setProperty('--app-cloze-color-rgb', clozeRgb);
  root.style.setProperty('--app-cloze-surface-color', `rgb(${clozeRgb} / 0.34)`);
}
