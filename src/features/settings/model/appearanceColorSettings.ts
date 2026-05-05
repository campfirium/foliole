import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

export type AccentColorPreset = string;
export type SelectionColorPreset = string;
export type HighlightColorPreset = string;
export type ClozeColorPreset = string;

export const DEFAULT_ACCENT_COLOR_PRESET: AccentColorPreset = '#3f8f68';
export const DEFAULT_SELECTION_COLOR_PRESET: SelectionColorPreset = '#3876ff';
export const DEFAULT_HIGHLIGHT_COLOR_PRESET: HighlightColorPreset = '#38bdf8';
export const DEFAULT_CLOZE_COLOR_PRESET: ClozeColorPreset = '#facc15';

const LEGACY_DEFAULT_HIGHLIGHT_COLOR_PRESETS = new Set<string>(['#3f8f68', '#202124']);

const COLOR_STORAGE_KEYS = {
  accentColor: APP_SETTINGS_STORAGE_KEYS.accentColor,
  selectionColor: APP_SETTINGS_STORAGE_KEYS.selectionColor,
  highlightColor: APP_SETTINGS_STORAGE_KEYS.highlightColor,
  clozeColor: APP_SETTINGS_STORAGE_KEYS.clozeColor
} as const;

function normalizeHexColor(value: string, fallback: string): string {
  const trimmed = value.trim();
  const match = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
  return match ? `#${match[1].toLowerCase()}` : fallback;
}

function normalizeAccentColor(value: string): string {
  return normalizeHexColor(value, DEFAULT_ACCENT_COLOR_PRESET);
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

function toColorRgb(value: string): string {
  const red = Number.parseInt(value.slice(1, 3), 16);
  const green = Number.parseInt(value.slice(3, 5), 16);
  const blue = Number.parseInt(value.slice(5, 7), 16);
  return `${red} ${green} ${blue}`;
}

export function getAccentColorPreset(): AccentColorPreset {
  const raw = getWhitelistedLocalStorageItem(COLOR_STORAGE_KEYS.accentColor);
  return raw ? normalizeAccentColor(raw) : DEFAULT_ACCENT_COLOR_PRESET;
}

export function setAccentColorPreset(value: AccentColorPreset) {
  setWhitelistedLocalStorageItem(COLOR_STORAGE_KEYS.accentColor, normalizeAccentColor(value));
}

export function getSelectionColorPreset(): SelectionColorPreset {
  const raw = getWhitelistedLocalStorageItem(COLOR_STORAGE_KEYS.selectionColor);
  return raw ? normalizeSelectionColor(raw) : DEFAULT_SELECTION_COLOR_PRESET;
}

export function setSelectionColorPreset(value: SelectionColorPreset) {
  setWhitelistedLocalStorageItem(COLOR_STORAGE_KEYS.selectionColor, normalizeSelectionColor(value));
}

export function getHighlightColorPreset(): HighlightColorPreset {
  const raw = getWhitelistedLocalStorageItem(COLOR_STORAGE_KEYS.highlightColor);
  if (!raw) {
    return DEFAULT_HIGHLIGHT_COLOR_PRESET;
  }
  const normalized = normalizeHighlightColor(raw);
  return LEGACY_DEFAULT_HIGHLIGHT_COLOR_PRESETS.has(normalized)
    ? DEFAULT_HIGHLIGHT_COLOR_PRESET
    : normalized;
}

export function setHighlightColorPreset(value: HighlightColorPreset) {
  setWhitelistedLocalStorageItem(COLOR_STORAGE_KEYS.highlightColor, normalizeHighlightColor(value));
}

export function getClozeColorPreset(): ClozeColorPreset {
  const raw = getWhitelistedLocalStorageItem(COLOR_STORAGE_KEYS.clozeColor);
  return raw ? normalizeClozeColor(raw) : DEFAULT_CLOZE_COLOR_PRESET;
}

export function setClozeColorPreset(value: ClozeColorPreset) {
  setWhitelistedLocalStorageItem(COLOR_STORAGE_KEYS.clozeColor, normalizeClozeColor(value));
}

interface ApplyAppearanceColorSettingsInput {
  accentColor: AccentColorPreset;
  clozeColor: ClozeColorPreset;
  highlightColor: HighlightColorPreset;
  selectionColor: SelectionColorPreset;
}

export function applyAppearanceColorSettings(root: HTMLElement, input: ApplyAppearanceColorSettingsInput) {
  const normalizedAccentColor = normalizeAccentColor(input.accentColor);
  const normalizedSelectionColor = normalizeSelectionColor(input.selectionColor);
  const normalizedHighlightColor = normalizeHighlightColor(input.highlightColor);
  const normalizedClozeColor = normalizeClozeColor(input.clozeColor);
  const accentRgb = toColorRgb(normalizedAccentColor);
  const selectionRgb = toColorRgb(normalizedSelectionColor);
  const highlightRgb = toColorRgb(normalizedHighlightColor);
  const clozeRgb = toColorRgb(normalizedClozeColor);

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
