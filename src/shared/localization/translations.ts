import type { AppLocale } from './appLanguage';
import { EN_TRANSLATIONS } from './locales/en';
import { ZH_HANS_TRANSLATIONS } from './locales/zhHans';

export type TranslationKey = keyof typeof EN_TRANSLATIONS;
export type TranslationParams = Record<string, string | number>;

export const TRANSLATIONS: Record<AppLocale, Partial<Record<TranslationKey, string>>> = {
  en: EN_TRANSLATIONS,
  'zh-Hans': ZH_HANS_TRANSLATIONS
};

function interpolate(template: string, params?: TranslationParams) {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  );
}

export function translate(locale: AppLocale, key: TranslationKey, params?: TranslationParams) {
  const template = TRANSLATIONS[locale][key] ?? EN_TRANSLATIONS[key];
  return interpolate(template, params);
}
