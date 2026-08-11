import {
  isExplicitSimplifiedChineseLanguageTag,
  readPrimaryLanguage
} from '../../../../lib/core/localization/systemLanguage';
import { getGuidedSampleLocaleOverride } from '../../../shared/platform/runtimeConfig';

export type GuidedSampleLocale = 'en-US' | 'zh-CN';

export function resolveGuidedSampleLocale(languages: readonly string[] = readNavigatorLanguages()): GuidedSampleLocale {
  const localeOverride = getGuidedSampleLocaleOverride();
  if (localeOverride) {
    return localeOverride;
  }
  return isExplicitSimplifiedChineseLanguageTag(readPrimaryLanguage(languages)) ? 'zh-CN' : 'en-US';
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
