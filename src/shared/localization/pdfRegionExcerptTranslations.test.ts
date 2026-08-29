import { expect, it } from 'vitest';

import { APP_LOCALES } from '../../../lib/core/localization/appLocaleRegistry';

import { preloadTranslationCatalog, translate } from './translations';

const REGION_EXCERPT_NAMES = {
  de: 'Bereichsauszug',
  en: 'Region excerpt',
  es: 'Extracto de región',
  fr: 'Extrait de zone',
  it: 'Estratto di area',
  ja: '範囲の抜粋',
  ko: '영역 발췌',
  pl: 'Wyciąg z obszaru',
  'pt-BR': 'Trecho de região',
  ru: 'Фрагмент области',
  'zh-Hans': '区域摘录',
  'zh-Hant': '區域摘錄'
} satisfies Record<(typeof APP_LOCALES)[number], string>;

it('projects region excerpt names and both interaction states to every locale', async () => {
  for (const locale of APP_LOCALES) {
    await preloadTranslationCatalog(locale);
    expect(translate(locale, 'desktop.pdf.imageExcerpt.mode')).toBe(REGION_EXCERPT_NAMES[locale]);
    expect(translate(locale, 'desktop.pdf.imageExcerpt.ordinary.title')).toContain(REGION_EXCERPT_NAMES[locale]);
    expect(translate(locale, 'desktop.pdf.imageExcerpt.ordinary.hint', { modifier: 'Alt' })).toContain('Alt');
    expect(translate(locale, 'desktop.pdf.imageExcerpt.quick.title')).toContain(REGION_EXCERPT_NAMES[locale]);
    expect(translate(locale, 'desktop.pdf.imageExcerpt.quick.hint')).not.toContain('{modifier}');
  }
});
