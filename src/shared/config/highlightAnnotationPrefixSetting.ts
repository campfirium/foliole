import { DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX } from '../../../lib/core/annotations/textAnnotationContent';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../platform/storage';

import { APP_SETTINGS_STORAGE_KEYS } from './appSettings';

export { DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX };

export const HIGHLIGHT_ANNOTATION_PREFIX_MAX_LENGTH = 24;

function normalizeHighlightAnnotationPrefix(value: string | null | undefined) {
  const normalized = (value ?? '').replace(/\r\n?/g, '\n').split('\n')[0]?.slice(0, HIGHLIGHT_ANNOTATION_PREFIX_MAX_LENGTH) ?? '';
  return normalized.length > 0 ? normalized : DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX;
}

export function getHighlightAnnotationPrefix() {
  return normalizeHighlightAnnotationPrefix(getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.highlightAnnotationPrefix));
}

export function setHighlightAnnotationPrefix(value: string) {
  const nextValue = normalizeHighlightAnnotationPrefix(value);
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.highlightAnnotationPrefix, nextValue);
  return nextValue;
}
