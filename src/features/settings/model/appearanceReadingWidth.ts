import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

export const READING_CONTENT_WIDTH_DEFAULT = 860;
export const READING_CONTENT_WIDTH_MIN = 680;
export const READING_CONTENT_WIDTH_MAX = 1040;
export const READING_CONTENT_WIDTH_STEP = 20;

function clampReadingContentWidth(value: number) {
  if (!Number.isFinite(value)) {
    return READING_CONTENT_WIDTH_DEFAULT;
  }
  return Math.min(READING_CONTENT_WIDTH_MAX, Math.max(READING_CONTENT_WIDTH_MIN, Math.round(value)));
}

export function getReadingContentWidth() {
  const raw = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.readingContentWidth);
  return clampReadingContentWidth(raw ? Number(raw) : READING_CONTENT_WIDTH_DEFAULT);
}

export function setReadingContentWidth(value: number) {
  const nextValue = clampReadingContentWidth(value);
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.readingContentWidth, String(nextValue));
}
