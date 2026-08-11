import { describe, expect, it } from 'vitest';

import { APP_LOCALES, resolveRegisteredAppLocale } from './appLocaleRegistry.js';

describe('formal app locale registry', () => {
  it('registers the README locale set in product order', () => {
    expect(APP_LOCALES).toEqual([
      'en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pl', 'pt-BR', 'ru', 'zh-Hans', 'zh-Hant'
    ]);
  });

  it('maps only semantically matching primary language tags', () => {
    expect(resolveRegisteredAppLocale('de-AT')).toBe('de');
    expect(resolveRegisteredAppLocale('pt')).toBe('pt-BR');
    expect(resolveRegisteredAppLocale('pt-BR')).toBe('pt-BR');
    expect(resolveRegisteredAppLocale('pt-PT')).toBeNull();
    expect(resolveRegisteredAppLocale('zh-CN')).toBe('zh-Hans');
    expect(resolveRegisteredAppLocale('zh-HK')).toBe('zh-Hant');
    expect(resolveRegisteredAppLocale('zh')).toBeNull();
  });
});
