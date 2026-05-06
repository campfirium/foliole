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
  clampFontSize,
  sanitizeFontFamily
} from './appearanceFontSettings';
import {
  DEFAULT_DIM_IMAGES_IN_DARK_MODE,
  DEFAULT_PDF_READING_MODE,
  DEFAULT_READING_LINE_HEIGHT,
  PDF_READING_MODE_OPTIONS,
  type InterfaceFontPreset,
  type MonospaceFontPreset,
  type PdfReadingMode,
  READING_LINE_HEIGHT_OPTIONS,
  type ReadingLineHeight
} from './appearanceSettingsOptions';
export {
  getReadingContentWidth,
  READING_CONTENT_WIDTH_DEFAULT,
  READING_CONTENT_WIDTH_MAX,
  READING_CONTENT_WIDTH_MIN,
  READING_CONTENT_WIDTH_STEP,
  setReadingContentWidth
} from './appearanceReadingWidth';
import {
  applyEditorTypographyScale,
  applyReadingLineHeight,
  resolveInterfaceFontFamily,
  resolveMonospaceFontFamily,
  resolveUiFontFamily
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
export {
  getCustomInterfaceFont,
  getCustomMonospaceFont,
  getCustomUiFont,
  getInterfaceFontPreset,
  getInterfaceFontSize,
  getMonospaceFontPreset,
  getUiFontPreset,
  setCustomInterfaceFont,
  setCustomMonospaceFont,
  setCustomUiFont,
  setInterfaceFontPreset,
  setInterfaceFontSize,
  setMonospaceFontPreset,
  setUiFontPreset
} from './appearanceFontSettings';
export {
  DEFAULT_DIM_IMAGES_IN_DARK_MODE,
  DEFAULT_PDF_READING_MODE,
  DEFAULT_READING_LINE_HEIGHT,
  INTERFACE_FONT_OPTIONS,
  INTERFACE_FONT_SIZE_DEFAULT,
  INTERFACE_FONT_SIZE_MAX,
  INTERFACE_FONT_SIZE_MIN,
  MONOSPACE_FONT_OPTIONS,
  PDF_READING_MODE_OPTIONS,
  READING_LINE_HEIGHT_OPTIONS,
  type InterfaceFontPreset,
  type MonospaceFontPreset,
  type PdfReadingMode,
  type ReadingLineHeight
} from './appearanceSettingsOptions';
const STORAGE_KEYS = {
  baseColor: APP_SETTINGS_STORAGE_KEYS.baseColor,
  pdfReadingMode: APP_SETTINGS_STORAGE_KEYS.pdfReadingMode,
  readingLineHeight: APP_SETTINGS_STORAGE_KEYS.readingLineHeight,
  dimImagesInDarkMode: APP_SETTINGS_STORAGE_KEYS.dimImagesInDarkMode
} as const;

function isPdfReadingMode(value: string): value is PdfReadingMode {
  return PDF_READING_MODE_OPTIONS.includes(value as PdfReadingMode);
}

function isReadingLineHeight(value: string): value is ReadingLineHeight {
  return READING_LINE_HEIGHT_OPTIONS.includes(value as ReadingLineHeight);
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

export function getReadingLineHeight(): ReadingLineHeight {
  const raw = getWhitelistedLocalStorageItem(STORAGE_KEYS.readingLineHeight);
  return raw && isReadingLineHeight(raw) ? raw : DEFAULT_READING_LINE_HEIGHT;
}

export function setReadingLineHeight(value: ReadingLineHeight) {
  setWhitelistedLocalStorageItem(STORAGE_KEYS.readingLineHeight, value);
}

export function getDimImagesInDarkMode() {
  const raw = getWhitelistedLocalStorageItem(STORAGE_KEYS.dimImagesInDarkMode);
  return raw === null ? DEFAULT_DIM_IMAGES_IN_DARK_MODE : raw === 'true';
}

export function setDimImagesInDarkMode(value: boolean) {
  setWhitelistedLocalStorageItem(STORAGE_KEYS.dimImagesInDarkMode, String(value));
}

interface ApplyAppearanceSettingsInput {
  baseColor: BaseColorMode;
  resolvedBaseColor: ResolvedBaseColorMode;
  pdfReadingMode: PdfReadingMode;
  readingContentWidth: number;
  readingLineHeight: ReadingLineHeight;
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
  readingContentWidth,
  readingLineHeight,
  dimImagesInDarkMode,
  accentColor,
  fontColor,
  selectionColor,
  highlightColor,
  clozeColor,
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
  const uiFontValue = resolveUiFontFamily();
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
  root.style.setProperty('--document-max-width', `${readingContentWidth}px`);
  applyEditorTypographyScale(root, clampedFontSize);
  applyReadingLineHeight(root, readingLineHeight);
}
