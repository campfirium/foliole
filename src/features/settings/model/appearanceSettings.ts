import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

import {
  applyAppearanceColorSettings,
  type AccentColorPreset,
  type ClozeColorPreset,
  DEFAULT_DARK_ACCENT_COLOR_PRESET,
  DEFAULT_DARK_CLOZE_COLOR_PRESET,
  DEFAULT_DARK_FONT_COLOR_PRESET,
  DEFAULT_DARK_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_DARK_SELECTION_COLOR_PRESET,
  DEFAULT_ACCENT_COLOR_PRESET,
  DEFAULT_CLOZE_COLOR_PRESET,
  DEFAULT_FONT_COLOR_PRESET,
  DEFAULT_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_SELECTION_COLOR_PRESET,
  getAccentColorPreset,
  getClozeColorPreset,
  getFontColorPreset,
  getHighlightColorPreset,
  getSelectionColorPreset,
  type FontColorPreset,
  type HighlightColorPreset,
  type SelectionColorPreset,
  setAccentColorPreset,
  setClozeColorPreset,
  setFontColorPreset,
  setHighlightColorPreset,
  setSelectionColorPreset
} from './appearanceColorSettings';
import {
  applyEditorTypographyScale,
  resolveInterfaceFontFamily,
  resolveMonospaceFontFamily
} from './appearanceTypography';
import { BASE_COLOR_OPTIONS, type BaseColorMode, isBaseColorMode, type ResolvedBaseColorMode } from './baseColorMode';
import {
  applyWorkspaceSurfaceSettings,
  DEFAULT_DARK_WORKSPACE_SURFACE_PALETTE,
  DEFAULT_WORKSPACE_SURFACE_ASSIGNMENTS,
  DEFAULT_WORKSPACE_SURFACE_PALETTE,
  getWorkspaceSurfaceAssignments,
  getWorkspaceSurfacePalette,
  setWorkspaceSurfaceAssignments,
  setWorkspaceSurfacePalette,
  type WorkspaceSurfaceAssignments,
  type WorkspaceSurfacePalette
} from './workspaceSurfaceSettings';
export {
  type AccentColorPreset,
  BASE_COLOR_OPTIONS,
  type BaseColorMode,
  type ClozeColorPreset,
  type FontColorPreset,
  type HighlightColorPreset,
  type SelectionColorPreset,
  DEFAULT_ACCENT_COLOR_PRESET,
  DEFAULT_CLOZE_COLOR_PRESET,
  DEFAULT_DARK_ACCENT_COLOR_PRESET,
  DEFAULT_DARK_CLOZE_COLOR_PRESET,
  DEFAULT_DARK_FONT_COLOR_PRESET,
  DEFAULT_DARK_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_DARK_SELECTION_COLOR_PRESET,
  DEFAULT_FONT_COLOR_PRESET,
  DEFAULT_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_SELECTION_COLOR_PRESET,
  getAccentColorPreset,
  getClozeColorPreset,
  getFontColorPreset,
  getHighlightColorPreset,
  getSelectionColorPreset,
  setAccentColorPreset,
  setClozeColorPreset,
  setFontColorPreset,
  setHighlightColorPreset,
  setSelectionColorPreset,
  type WorkspaceSurfaceAssignments,
  type WorkspaceSurfacePalette,
  DEFAULT_WORKSPACE_SURFACE_ASSIGNMENTS,
  DEFAULT_WORKSPACE_SURFACE_PALETTE,
  DEFAULT_DARK_WORKSPACE_SURFACE_PALETTE,
  type ResolvedBaseColorMode,
  getWorkspaceSurfaceAssignments,
  getWorkspaceSurfacePalette,
  setWorkspaceSurfaceAssignments,
  setWorkspaceSurfacePalette
};
export const INTERFACE_FONT_OPTIONS = ['default', 'inter', 'system', 'source-sans', 'serif', 'rounded', 'custom'] as const;
export const MONOSPACE_FONT_OPTIONS = ['default', 'jetbrains', 'cascadia', 'consolas', 'fira', 'sarasa', 'custom'] as const;
export const PDF_READING_MODE_OPTIONS = ['original', 'inverted', 'warm'] as const;
export type InterfaceFontPreset = (typeof INTERFACE_FONT_OPTIONS)[number];
export type MonospaceFontPreset = (typeof MONOSPACE_FONT_OPTIONS)[number];
export type PdfReadingMode = (typeof PDF_READING_MODE_OPTIONS)[number];
export const INTERFACE_FONT_SIZE_MIN = 12;
export const INTERFACE_FONT_SIZE_MAX = 36;
export const INTERFACE_FONT_SIZE_DEFAULT = 17;
export const DEFAULT_PDF_READING_MODE: PdfReadingMode = 'inverted';
export const DEFAULT_DIM_IMAGES_IN_DARK_MODE = false;
const STORAGE_KEYS = {
  uiFont: APP_SETTINGS_STORAGE_KEYS.uiFont,
  customUiFont: APP_SETTINGS_STORAGE_KEYS.customUiFont,
  interfaceFont: APP_SETTINGS_STORAGE_KEYS.interfaceFont,
  monospaceFont: APP_SETTINGS_STORAGE_KEYS.monospaceFont,
  baseColor: APP_SETTINGS_STORAGE_KEYS.baseColor,
  pdfReadingMode: APP_SETTINGS_STORAGE_KEYS.pdfReadingMode,
  dimImagesInDarkMode: APP_SETTINGS_STORAGE_KEYS.dimImagesInDarkMode,
  interfaceFontSize: APP_SETTINGS_STORAGE_KEYS.interfaceFontSize,
  customInterfaceFont: APP_SETTINGS_STORAGE_KEYS.customInterfaceFont,
  customMonospaceFont: APP_SETTINGS_STORAGE_KEYS.customMonospaceFont
} as const;

function isInterfaceFontPreset(value: string): value is InterfaceFontPreset {
  return INTERFACE_FONT_OPTIONS.includes(value as InterfaceFontPreset);
}

function isMonospaceFontPreset(value: string): value is MonospaceFontPreset {
  return MONOSPACE_FONT_OPTIONS.includes(value as MonospaceFontPreset);
}

function isPdfReadingMode(value: string): value is PdfReadingMode {
  return PDF_READING_MODE_OPTIONS.includes(value as PdfReadingMode);
}

function clampFontSize(value: number) {
  return Math.max(INTERFACE_FONT_SIZE_MIN, Math.min(INTERFACE_FONT_SIZE_MAX, Math.round(value)));
}

function sanitizeFontFamily(value: string) {
  const cleaned = value.replace(/[;{}]/g, '').replace(/^@/, '').replace(/\s*\([^)]*\)\s*$/g, '').trim();
  const primaryName = cleaned.split(/\s+&\s+/)[0]?.trim() ?? '';
  return primaryName.slice(0, 256);
}

export function getInterfaceFontPreset(): InterfaceFontPreset {
  const raw = getWhitelistedLocalStorageItem(STORAGE_KEYS.interfaceFont);
  return raw && isInterfaceFontPreset(raw) ? raw : 'default';
}

export function getUiFontPreset(): InterfaceFontPreset {
  const raw = getWhitelistedLocalStorageItem(STORAGE_KEYS.uiFont);
  return raw && isInterfaceFontPreset(raw) ? raw : 'default';
}

export function setUiFontPreset(value: InterfaceFontPreset) {
  setWhitelistedLocalStorageItem(STORAGE_KEYS.uiFont, value);
}

export function setInterfaceFontPreset(value: InterfaceFontPreset) {
  setWhitelistedLocalStorageItem(STORAGE_KEYS.interfaceFont, value);
}

export function getCustomUiFont() {
  const raw = getWhitelistedLocalStorageItem(STORAGE_KEYS.customUiFont);
  return raw ? sanitizeFontFamily(raw) : '';
}

export function setCustomUiFont(value: string) {
  setWhitelistedLocalStorageItem(STORAGE_KEYS.customUiFont, sanitizeFontFamily(value));
}

export function getCustomInterfaceFont() {
  const raw = getWhitelistedLocalStorageItem(STORAGE_KEYS.customInterfaceFont);
  return raw ? sanitizeFontFamily(raw) : '';
}

export function setCustomInterfaceFont(value: string) {
  setWhitelistedLocalStorageItem(STORAGE_KEYS.customInterfaceFont, sanitizeFontFamily(value));
}

export function getCustomMonospaceFont() {
  const raw = getWhitelistedLocalStorageItem(STORAGE_KEYS.customMonospaceFont);
  return raw ? sanitizeFontFamily(raw) : '';
}

export function setCustomMonospaceFont(value: string) {
  setWhitelistedLocalStorageItem(STORAGE_KEYS.customMonospaceFont, sanitizeFontFamily(value));
}

export function getMonospaceFontPreset(): MonospaceFontPreset {
  const raw = getWhitelistedLocalStorageItem(STORAGE_KEYS.monospaceFont);
  return raw && isMonospaceFontPreset(raw) ? raw : 'default';
}

export function setMonospaceFontPreset(value: MonospaceFontPreset) {
  setWhitelistedLocalStorageItem(STORAGE_KEYS.monospaceFont, value);
}

export function getBaseColorMode(): BaseColorMode {
  const raw = getWhitelistedLocalStorageItem(STORAGE_KEYS.baseColor);
  return raw && isBaseColorMode(raw) ? raw : 'light';
}

export function setBaseColorMode(value: BaseColorMode) {
  setWhitelistedLocalStorageItem(STORAGE_KEYS.baseColor, value);
}

export function getPdfReadingMode(): PdfReadingMode {
  const raw = getWhitelistedLocalStorageItem(STORAGE_KEYS.pdfReadingMode);
  return raw && isPdfReadingMode(raw) ? raw : DEFAULT_PDF_READING_MODE;
}

export function setPdfReadingMode(value: PdfReadingMode) {
  setWhitelistedLocalStorageItem(STORAGE_KEYS.pdfReadingMode, value);
}

export function getDimImagesInDarkMode() {
  const raw = getWhitelistedLocalStorageItem(STORAGE_KEYS.dimImagesInDarkMode);
  return raw === null ? DEFAULT_DIM_IMAGES_IN_DARK_MODE : raw === 'true';
}

export function setDimImagesInDarkMode(value: boolean) {
  setWhitelistedLocalStorageItem(STORAGE_KEYS.dimImagesInDarkMode, String(value));
}

export function getInterfaceFontSize() {
  const raw = getWhitelistedLocalStorageItem(STORAGE_KEYS.interfaceFontSize);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? clampFontSize(parsed) : INTERFACE_FONT_SIZE_DEFAULT;
}

export function setInterfaceFontSize(value: number) {
  setWhitelistedLocalStorageItem(STORAGE_KEYS.interfaceFontSize, String(clampFontSize(value)));
}

interface ApplyAppearanceSettingsInput {
  baseColor: BaseColorMode;
  resolvedBaseColor: ResolvedBaseColorMode;
  pdfReadingMode: PdfReadingMode;
  dimImagesInDarkMode: boolean;
  accentColor: AccentColorPreset;
  fontColor: FontColorPreset;
  selectionColor: SelectionColorPreset;
  highlightColor: HighlightColorPreset;
  clozeColor: ClozeColorPreset;
  uiFont: InterfaceFontPreset;
  customUiFont: string;
  interfaceFont: InterfaceFontPreset;
  interfaceFontSize: number;
  monospaceFont: MonospaceFontPreset;
  customInterfaceFont: string;
  customMonospaceFont: string;
  workspaceSurfaceAssignments: WorkspaceSurfaceAssignments;
  workspaceSurfacePalette: WorkspaceSurfacePalette;
}

export function applyAppearanceSettings({
  baseColor,
  resolvedBaseColor,
  pdfReadingMode,
  dimImagesInDarkMode,
  accentColor,
  fontColor,
  selectionColor,
  highlightColor,
  clozeColor,
  uiFont,
  customUiFont,
  interfaceFont,
  interfaceFontSize,
  monospaceFont,
  customInterfaceFont,
  customMonospaceFont,
  workspaceSurfaceAssignments,
  workspaceSurfacePalette
}: ApplyAppearanceSettingsInput) {
  if (typeof document === 'undefined') {
    return;
  }
  const clampedFontSize = clampFontSize(interfaceFontSize);
  const uiFontValue = resolveInterfaceFontFamily(uiFont, sanitizeFontFamily(customUiFont));
  const interfaceFontValue = resolveInterfaceFontFamily(interfaceFont, sanitizeFontFamily(customInterfaceFont));
  const monospaceFontValue = resolveMonospaceFontFamily(monospaceFont, sanitizeFontFamily(customMonospaceFont));
  const root = document.documentElement;
  root.dataset.baseColor = baseColor;
  root.dataset.dimImagesInDarkMode = dimImagesInDarkMode ? 'true' : 'false';
  root.dataset.pdfReadingMode = pdfReadingMode;
  root.dataset.resolvedBaseColor = resolvedBaseColor;
  applyAppearanceColorSettings(root, {
    accentColor,
    clozeColor,
    fontColor,
    highlightColor,
    mode: resolvedBaseColor,
    selectionColor
  });
  applyWorkspaceSurfaceSettings(root, {
    assignments: workspaceSurfaceAssignments,
    palette: workspaceSurfacePalette
  });
  root.style.setProperty('--app-interface-font-family', uiFontValue);
  root.style.setProperty('--content-panel-font-family', interfaceFontValue);
  root.style.setProperty('--content-panel-mono-font-family', monospaceFontValue);
  applyEditorTypographyScale(root, clampedFontSize);
}
