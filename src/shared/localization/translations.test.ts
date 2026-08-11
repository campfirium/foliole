import { describe, expect, it } from 'vitest';

import { APP_LOCALES } from '../../../lib/core/localization/appLocaleRegistry';

import {
  hasTranslationCatalog,
  preloadTranslationCatalog,
  resolveTranslationTemplate,
  safelyLoadTranslationCatalog,
  translate
} from './translations';

describe('translation catalog loading', () => {
  it('falls back to English before a target catalog is available', () => {
    expect(translate('de', 'settings.title')).toBe('Settings');
    expect(resolveTranslationTemplate({}, 'settings.title')).toBeUndefined();
  });

  it('loads every target catalog independently', async () => {
    for (const locale of APP_LOCALES) {
      expect(await preloadTranslationCatalog(locale)).toBe(true);
      expect(hasTranslationCatalog(locale)).toBe(true);
    }
  });

  it('keeps a rejected catalog load recoverable', async () => {
    await expect(safelyLoadTranslationCatalog(() => Promise.reject(new Error('missing chunk'))))
      .resolves.toBeNull();
    expect(translate('en', 'settings.title')).toBe('Settings');
  });
});
