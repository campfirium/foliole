import { getStoredAppLocale, type AppLocale } from '../../../shared/localization/appLanguage';
import { getGuidedSampleLocaleOverride } from '../../../shared/platform/runtimeConfig';

export type GuidedSampleLocale = AppLocale;

export function resolveGuidedSampleLocale(locale: AppLocale = getStoredAppLocale()): GuidedSampleLocale {
  const override = getGuidedSampleLocaleOverride();
  if (override === 'en-US') return 'en';
  if (override === 'zh-CN') return 'zh-Hans';
  return locale;
}
