import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, removeWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

export const DEFAULT_NAVIGATION_TITLE_FONT_SIZE = 14;
export const MIN_NAVIGATION_TITLE_FONT_SIZE = 12;
export const MAX_NAVIGATION_TITLE_FONT_SIZE = 20;
export const DEFAULT_NAVIGATION_META_FONT_SIZE = 12;
export const MIN_NAVIGATION_META_FONT_SIZE = 10;
export const MAX_NAVIGATION_META_FONT_SIZE = 18;

function normalize(value: string | null, fallback: number, min: number, max: number) {
  const parsed = value === null ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function persist(key: string, value: number, fallback: number) {
  if (value === fallback) removeWhitelistedLocalStorageItem(key);
  else setWhitelistedLocalStorageItem(key, String(value));
}

export function getNavigationTitleFontSize() {
  return normalize(getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.navigationTitleFontSize), DEFAULT_NAVIGATION_TITLE_FONT_SIZE, MIN_NAVIGATION_TITLE_FONT_SIZE, MAX_NAVIGATION_TITLE_FONT_SIZE);
}

export function setNavigationTitleFontSize(value: number) {
  const next = normalize(String(value), DEFAULT_NAVIGATION_TITLE_FONT_SIZE, MIN_NAVIGATION_TITLE_FONT_SIZE, MAX_NAVIGATION_TITLE_FONT_SIZE);
  persist(APP_SETTINGS_STORAGE_KEYS.navigationTitleFontSize, next, DEFAULT_NAVIGATION_TITLE_FONT_SIZE);
  return next;
}

export function getNavigationMetaFontSize() {
  return normalize(getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.navigationMetaFontSize), DEFAULT_NAVIGATION_META_FONT_SIZE, MIN_NAVIGATION_META_FONT_SIZE, MAX_NAVIGATION_META_FONT_SIZE);
}

export function setNavigationMetaFontSize(value: number) {
  const next = normalize(String(value), DEFAULT_NAVIGATION_META_FONT_SIZE, MIN_NAVIGATION_META_FONT_SIZE, MAX_NAVIGATION_META_FONT_SIZE);
  persist(APP_SETTINGS_STORAGE_KEYS.navigationMetaFontSize, next, DEFAULT_NAVIGATION_META_FONT_SIZE);
  return next;
}

export function resolveNavigationTitleLineHeight(fontSize: number) {
  return Math.max(20, Math.ceil(fontSize * 1.4));
}

export function resolveNavigationMetaLineHeight(fontSize: number) {
  return Math.max(18, Math.ceil(fontSize * 1.4));
}
