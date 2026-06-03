import { getElectronAPI } from '../../../shared/platform/electronApi';

export type GuidedSampleLocale = 'en-US' | 'zh-CN';

const SIMPLIFIED_CHINESE_LANGUAGE_TAGS = new Set(['zh-cn', 'zh-hans', 'zh-sg']);

function normalizeLanguageTag(language: string) {
  return language.trim().toLowerCase().replace('_', '-');
}

export function isSimplifiedChineseLanguage(language: string) {
  const normalized = normalizeLanguageTag(language);
  return SIMPLIFIED_CHINESE_LANGUAGE_TAGS.has(normalized) || normalized.startsWith('zh-hans-');
}

export function resolveGuidedSampleLocale(languages: readonly string[] = readNavigatorLanguages()): GuidedSampleLocale {
  const localeOverride = getElectronAPI()?.runtimeConfig?.guidedSampleLocale;
  if (localeOverride) {
    return localeOverride;
  }
  return languages.some(isSimplifiedChineseLanguage) ? 'zh-CN' : 'en-US';
}

function readNavigatorLanguages() {
  if (typeof navigator === 'undefined') {
    return [];
  }
  if (navigator.languages.length > 0) {
    return navigator.languages;
  }
  return navigator.language ? [navigator.language] : [];
}
