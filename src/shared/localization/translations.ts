import type { AppLocale } from './appLanguage';
import { EN_TRANSLATIONS } from './locales/en';

export type TranslationKey = keyof typeof EN_TRANSLATIONS;
export type TranslationParams = Record<string, string | number>;
type TranslationCatalog = Partial<Record<TranslationKey, string>>;

const TRANSLATIONS: Partial<Record<AppLocale, TranslationCatalog>> = {
  en: EN_TRANSLATIONS
};
const translationCatalogPromises = new Map<AppLocale, Promise<void>>();

function interpolate(template: string, params?: TranslationParams) {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  );
}

export function translate(locale: AppLocale, key: TranslationKey, params?: TranslationParams) {
  const template = TRANSLATIONS[locale]?.[key] ?? EN_TRANSLATIONS[key] ?? key;
  return interpolate(template, params);
}

export function hasTranslationCatalog(locale: AppLocale) {
  return Boolean(TRANSLATIONS[locale]);
}

export function preloadTranslationCatalog(locale: AppLocale) {
  if (hasTranslationCatalog(locale)) {
    return Promise.resolve();
  }
  const existingPromise = translationCatalogPromises.get(locale);
  if (existingPromise) {
    return existingPromise;
  }
  const promise = import('./locales/zhHans').then((module) => {
    TRANSLATIONS['zh-Hans'] = module.ZH_HANS_TRANSLATIONS;
  }).finally(() => {
    translationCatalogPromises.delete(locale);
  });
  translationCatalogPromises.set(locale, promise);
  return promise;
}
