import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

import {
  DEFAULT_READING_LINE_HEIGHT,
  READING_LINE_HEIGHT_MAX,
  READING_LINE_HEIGHT_MIN,
  type ReadingLineHeight
} from './appearanceSettingsOptions';
import { normalizeReadingLineHeight } from './appearanceTypography';

const READING_LINE_HEIGHT_STORAGE_KEY = APP_SETTINGS_STORAGE_KEYS.readingLineHeight;

function normalizeStoredReadingLineHeight(value: string | null): ReadingLineHeight {
  if (value === 'compact') {
    return 1.4;
  }
  if (value === 'standard') {
    return DEFAULT_READING_LINE_HEIGHT;
  }
  if (value === 'relaxed') {
    return 1.85;
  }
  if (value === null) {
    return DEFAULT_READING_LINE_HEIGHT;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= READING_LINE_HEIGHT_MIN && parsed <= READING_LINE_HEIGHT_MAX
    ? normalizeReadingLineHeight(parsed)
    : DEFAULT_READING_LINE_HEIGHT;
}

export function getReadingLineHeight(): ReadingLineHeight {
  return normalizeStoredReadingLineHeight(getWhitelistedLocalStorageItem(READING_LINE_HEIGHT_STORAGE_KEY));
}

export function setReadingLineHeight(value: ReadingLineHeight) {
  const nextValue = normalizeReadingLineHeight(value);
  setWhitelistedLocalStorageItem(READING_LINE_HEIGHT_STORAGE_KEY, String(nextValue));
  return nextValue;
}
