import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

import {
  DEFAULT_READING_PARAGRAPH_SPACING,
  READING_PARAGRAPH_SPACING_MAX,
  READING_PARAGRAPH_SPACING_MIN,
  type ReadingParagraphSpacing
} from './appearanceSettingsOptions';
import { normalizeReadingParagraphSpacing } from './appearanceTypography';

const READING_PARAGRAPH_SPACING_STORAGE_KEY = APP_SETTINGS_STORAGE_KEYS.readingParagraphSpacing;

function normalizeStoredReadingParagraphSpacing(value: string | null): ReadingParagraphSpacing {
  if (value === null) {
    return DEFAULT_READING_PARAGRAPH_SPACING;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= READING_PARAGRAPH_SPACING_MIN && parsed <= READING_PARAGRAPH_SPACING_MAX
    ? normalizeReadingParagraphSpacing(parsed)
    : DEFAULT_READING_PARAGRAPH_SPACING;
}

export function getReadingParagraphSpacing(): ReadingParagraphSpacing {
  return normalizeStoredReadingParagraphSpacing(getWhitelistedLocalStorageItem(READING_PARAGRAPH_SPACING_STORAGE_KEY));
}

export function setReadingParagraphSpacing(value: ReadingParagraphSpacing) {
  const nextValue = normalizeReadingParagraphSpacing(value);
  setWhitelistedLocalStorageItem(READING_PARAGRAPH_SPACING_STORAGE_KEY, String(nextValue));
  return nextValue;
}
