import { beforeEach, describe, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import {
  DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX,
  getHighlightAnnotationPrefix,
  setHighlightAnnotationPrefix
} from './highlightAnnotationPrefixSetting';

beforeEach(() => {
  window.localStorage.clear();
});

describe('highlightAnnotationPrefixSetting', () => {
  it('uses the default annotation prefix when no saved value exists', () => {
    expect(getHighlightAnnotationPrefix()).toBe(DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX);
  });

  it('persists a custom single-line annotation prefix', () => {
    expect(setHighlightAnnotationPrefix('>> ')).toBe('>> ');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.highlightAnnotationPrefix)).toBe('>> ');
    expect(getHighlightAnnotationPrefix()).toBe('>> ');
  });

  it('falls back to the default prefix when the saved value is empty', () => {
    expect(setHighlightAnnotationPrefix('')).toBe(DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX);
  });
});
