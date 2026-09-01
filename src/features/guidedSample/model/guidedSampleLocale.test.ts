import { afterEach, describe, expect, it, vi } from 'vitest';

import { APP_LOCALES } from '../../../../lib/core/localization/appLocaleRegistry';
import { APP_LANGUAGE_STORAGE_KEY } from '../../../shared/localization/appLanguage';

import { resolveGuidedSampleLocale } from './guidedSampleLocale';

describe('resolveGuidedSampleLocale', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('preserves every registered application locale', () => {
    for (const locale of APP_LOCALES) {
      expect(resolveGuidedSampleLocale(locale)).toBe(locale);
    }
  });

  it('uses the stored application locale when no explicit locale is provided', () => {
    localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'de');
    expect(resolveGuidedSampleLocale()).toBe('de');
  });

  it('keeps the legacy sample override ahead of the application locale', () => {
    vi.stubGlobal('window', {
      electronAPI: {
        runtimeConfig: { guidedSampleLocale: 'zh-CN' }
      }
    });

    expect(resolveGuidedSampleLocale('de')).toBe('zh-Hans');
  });
});
