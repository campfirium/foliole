import { APP_SETTINGS_STORAGE_KEYS, DEFAULT_BASE_COLOR_MODE } from '../../../shared/config/appSettings';
import { parseLiteralUnion } from '../../../shared/lib/parseLiteralUnion';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

import {
  DEFAULT_DIM_IMAGES_IN_DARK_MODE,
  DEFAULT_PDF_READING_MODE,
  PDF_READING_MODE_OPTIONS,
  type PdfReadingMode
} from './appearanceSettingsOptions';
import { type BaseColorMode, isBaseColorMode, type ResolvedBaseColorMode } from './baseColorMode';

const STORAGE_KEYS = {
  baseColor: APP_SETTINGS_STORAGE_KEYS.baseColor,
  dimImagesInDarkMode: APP_SETTINGS_STORAGE_KEYS.dimImagesInDarkMode,
  immersiveDoubleClickEditEnabled: APP_SETTINGS_STORAGE_KEYS.immersiveDoubleClickEditEnabled,
  pdfReadingMode: APP_SETTINGS_STORAGE_KEYS.pdfReadingMode
} as const;

export const DEFAULT_IMMERSIVE_DOUBLE_CLICK_EDIT_ENABLED = true;

function isPdfReadingMode(value: string): value is PdfReadingMode {
  return parseLiteralUnion(value, PDF_READING_MODE_OPTIONS) !== null;
}

export function getBaseColorMode(): BaseColorMode {
  const raw = getWhitelistedLocalStorageItem(STORAGE_KEYS.baseColor);
  return raw && isBaseColorMode(raw) ? raw : DEFAULT_BASE_COLOR_MODE;
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

export function getImmersiveDoubleClickEditEnabled() {
  const raw = getWhitelistedLocalStorageItem(STORAGE_KEYS.immersiveDoubleClickEditEnabled);
  return raw === null ? DEFAULT_IMMERSIVE_DOUBLE_CLICK_EDIT_ENABLED : raw === 'true';
}

export function setImmersiveDoubleClickEditEnabled(value: boolean) {
  setWhitelistedLocalStorageItem(STORAGE_KEYS.immersiveDoubleClickEditEnabled, String(value));
}

export function resolvePdfReadingModeForColorMode(
  pdfReadingMode: PdfReadingMode,
  resolvedBaseColorMode: ResolvedBaseColorMode
): PdfReadingMode {
  return resolvedBaseColorMode === 'dark' ? pdfReadingMode : 'original';
}

export function getDimImagesInDarkMode() {
  const raw = getWhitelistedLocalStorageItem(STORAGE_KEYS.dimImagesInDarkMode);
  return raw === null ? DEFAULT_DIM_IMAGES_IN_DARK_MODE : raw === 'true';
}

export function setDimImagesInDarkMode(value: boolean) {
  setWhitelistedLocalStorageItem(STORAGE_KEYS.dimImagesInDarkMode, String(value));
}
