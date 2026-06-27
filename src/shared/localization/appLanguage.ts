import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../platform/storage';

const APP_LOCALES = ['en', 'zh-Hans'] as const;
export type AppLocale = (typeof APP_LOCALES)[number];
const APP_LANGUAGE_PREFERENCES = ['system', ...APP_LOCALES] as const;
export type AppLanguagePreference = (typeof APP_LANGUAGE_PREFERENCES)[number];

const DEFAULT_APP_LOCALE: AppLocale = 'en';
const DEFAULT_APP_LANGUAGE_PREFERENCE: AppLanguagePreference = 'system';
export const APP_LANGUAGE_STORAGE_KEY = APP_SETTINGS_STORAGE_KEYS.appLanguage;

export function isAppLanguagePreference(value: string): value is AppLanguagePreference {
  return APP_LANGUAGE_PREFERENCES.includes(value as AppLanguagePreference);
}

function isAppLocale(value: string): value is AppLocale {
  return APP_LOCALES.includes(value as AppLocale);
}

function normalizeAppLanguagePreference(value: string | null | undefined): AppLanguagePreference {
  return value && isAppLanguagePreference(value) ? value : DEFAULT_APP_LANGUAGE_PREFERENCE;
}

function resolveDevAppLocaleOverride(): AppLocale | null {
  const overrideEnabled = import.meta.env.DEV ||
    import.meta.env.MODE === 'test' ||
    import.meta.env.VITE_FOLIOLE_INTERNAL_BUILD === '1';
  const override = import.meta.env.VITE_FOLIOLE_DEV_APP_LANGUAGE;
  if (!overrideEnabled || !override) {
    return null;
  }
  return isAppLocale(override) ? override : null;
}

export function resolveSystemAppLocale(languages: readonly string[] = getNavigatorLanguages()): AppLocale {
  return languages.some((language) => language.toLowerCase().startsWith('zh')) ? 'zh-Hans' : DEFAULT_APP_LOCALE;
}

export function resolveAppLocale(preference: AppLanguagePreference): AppLocale {
  return resolveDevAppLocaleOverride() ?? (preference === 'system' ? resolveSystemAppLocale() : preference);
}

export function getStoredAppLocale(): AppLocale {
  return resolveAppLocale(getStoredAppLanguagePreference());
}

export function getStoredAppLanguagePreference(): AppLanguagePreference {
  return normalizeAppLanguagePreference(getWhitelistedLocalStorageItem(APP_LANGUAGE_STORAGE_KEY));
}

export function setStoredAppLanguagePreference(preference: AppLanguagePreference) {
  setWhitelistedLocalStorageItem(APP_LANGUAGE_STORAGE_KEY, preference);
}

export function setStoredAppLocale(locale: AppLocale) {
  setStoredAppLanguagePreference(locale);
}

function getNavigatorLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') {
    return [];
  }
  if (navigator.languages.length > 0) {
    return navigator.languages;
  }
  return navigator.language ? [navigator.language] : [];
}
